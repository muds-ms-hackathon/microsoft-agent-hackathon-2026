import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Context } from "hono";
import { prisma } from "../lib/prisma.js";
import { taskCreateSchema } from "../lib/schemas/task.js";
import { auth, type AuthVariables } from "../middleware/auth.js";

// GET / POST / PATCH のレスポンス整形で共通利用する include 設定。
// 中間テーブル経由の関連は user / recurringMeeting / originMeeting を最小フィールドで取得する。
const taskInclude = {
  assignees: {
    include: {
      user: {
        select: { id: true, name: true, displayName: true, email: true },
      },
    },
  },
  recurringMeetings: {
    include: {
      recurringMeeting: { select: { id: true, name: true } },
    },
  },
  originMeeting: {
    select: { id: true, title: true, heldAt: true, recurringMeetingId: true },
  },
  organization: { select: { id: true, name: true } },
} as const;

// Prisma が返す中間テーブル経由の構造をフロント向けに平坦化する。
// biome-ignore lint/suspicious/noExplicitAny: include 結果の型が広いので any で受ける
function serializeTask(task: any) {
  const { assignees, recurringMeetings, ...rest } = task;
  return {
    ...rest,
    // biome-ignore lint/suspicious/noExplicitAny: 中間テーブルの行型
    assignees: assignees.map((a: any) => a.user),
    // biome-ignore lint/suspicious/noExplicitAny: 中間テーブルの行型
    recurringMeetings: recurringMeetings.map((r: any) => r.recurringMeeting),
  };
}

// 認証ユーザーが対象組織に所属しているか確認する。
// 所属していない場合は組織の存在自体を露出させないため 404 で統一する。
async function requireOrgMembership(
  c: Context<{ Variables: AuthVariables }>,
  organizationId: string,
): Promise<{ ok: true } | { ok: false; res: Response }> {
  const user = c.var.user;
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: { userId: user.id, organizationId },
    },
  });
  if (!membership) {
    return { ok: false, res: c.json({ error: "組織が見つかりません" }, 404) };
  }
  return { ok: true };
}

// assigneeUserIds が全員 organizationId のメンバーであるかを検証する。
// 一括 findMany → 件数比較で OK / NG を判定する。
async function validateAssigneesInOrg(
  organizationId: string,
  userIds: string[],
): Promise<boolean> {
  if (userIds.length === 0) return true;
  const members = await prisma.organizationMembership.findMany({
    where: { organizationId, userId: { in: userIds } },
    select: { userId: true },
  });
  return members.length === userIds.length;
}

// recurringMeetingIds が全件 organizationId 配下に属するかを検証する。
async function validateRecurringMeetingsInOrg(
  organizationId: string,
  recurringMeetingIds: string[],
): Promise<boolean> {
  if (recurringMeetingIds.length === 0) return true;
  const rms = await prisma.recurringMeeting.findMany({
    where: { id: { in: recurringMeetingIds }, organizationId },
    select: { id: true },
  });
  return rms.length === recurringMeetingIds.length;
}

// originMeetingId が指定された場合、その会議が当該組織に属することを確認する。
// 紐付く recurringMeeting 経由で組織判定する（単発会議は MVP では 400 で拒否）。
async function validateOriginMeetingInOrg(
  organizationId: string,
  meetingId: string,
): Promise<boolean> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { recurringMeeting: { select: { organizationId: true } } },
  });
  if (!meeting) return false;
  if (!meeting.recurringMeeting) return false;
  return meeting.recurringMeeting.organizationId === organizationId;
}

export const tasksRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", auth)
  .post("/", zValidator("json", taskCreateSchema), async (c) => {
    const input = c.req.valid("json");

    const guard = await requireOrgMembership(c, input.organizationId);
    if (!guard.ok) return guard.res;

    const assigneeUserIds = input.assigneeUserIds ?? [];
    const recurringMeetingIds = input.recurringMeetingIds ?? [];

    // クロス組織アタッチを防ぐ各バリデーション。
    // assignees / recurringMeetings / originMeeting それぞれで組織整合を確認する。
    if (
      !(await validateAssigneesInOrg(input.organizationId, assigneeUserIds))
    ) {
      return c.json(
        { error: "担当者は組織のメンバーである必要があります" },
        400,
      );
    }
    if (
      !(await validateRecurringMeetingsInOrg(
        input.organizationId,
        recurringMeetingIds,
      ))
    ) {
      return c.json({ error: "定例は組織に属している必要があります" }, 400);
    }
    if (input.originMeetingId) {
      const ok = await validateOriginMeetingInOrg(
        input.organizationId,
        input.originMeetingId,
      );
      if (!ok) {
        return c.json(
          { error: "発生源会議が見つからないか組織に属していません" },
          400,
        );
      }
    }

    // Task 本体 + 中間テーブル 2 つを原子的に作成する。
    // 手動経路の status は常に "todo" 固定（入力値があっても無視）。
    const created = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          organizationId: input.organizationId,
          title: input.title,
          body: input.body,
          status: "todo",
          priority: input.priority,
          originMeetingId: input.originMeetingId,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          followUpDate: input.followUpDate
            ? new Date(input.followUpDate)
            : undefined,
        },
      });
      if (assigneeUserIds.length > 0) {
        await tx.taskAssignee.createMany({
          data: assigneeUserIds.map((userId) => ({ taskId: task.id, userId })),
        });
      }
      if (recurringMeetingIds.length > 0) {
        await tx.taskRecurringMeeting.createMany({
          data: recurringMeetingIds.map((recurringMeetingId) => ({
            taskId: task.id,
            recurringMeetingId,
          })),
        });
      }
      return tx.task.findUnique({
        where: { id: task.id },
        include: taskInclude,
      });
    });

    return c.json(serializeTask(created), 201);
  });
