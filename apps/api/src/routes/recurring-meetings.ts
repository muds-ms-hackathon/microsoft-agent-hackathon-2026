import { zValidator } from "@hono/zod-validator";
import type { MeetingRole, RecurringMeeting } from "@prisma/client";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { recurringMeetingUpdateSchema } from "../lib/schemas/recurring-meeting.js";
import {
  buildTaskListWhere,
  taskListQuerySchema,
} from "../lib/schemas/task.js";
import {
  serializeTask,
  taskListInclude,
  taskListOrderBy,
} from "../lib/task-serialization.js";
import { auth, type AuthVariables } from "../middleware/auth.js";
import { findOrgMembership } from "../middleware/authz.js";

// 定例配下に紐付ける Meeting 作成リクエストの schema。
// estimatedDurationMinutes は省略・null・数値の 3 形態を許容し、省略 / null は
// 「未指定」として扱ってハンドラ側で defaultDurationMinutes へフォールバックする。
// JSON では undefined を表現できないため、クライアントは「未指定」を null で送る
// ことが多い。許容範囲を広げるだけで、不正値（範囲外・型違い）は従来どおり 400。
// 範囲は RecurringMeeting.defaultDurationMinutes と同じ 1〜480 分。
const createMeetingSchema = z.object({
  title: z.string().min(1, "title は必須です"),
  heldAt: z
    .string()
    .datetime({ message: "heldAt は ISO8601 で指定してください" }),
  estimatedDurationMinutes: z
    .number()
    .int()
    .min(1, "estimatedDurationMinutes は 1 分以上で指定してください")
    .max(480, "estimatedDurationMinutes は 480 分以下で指定してください")
    .nullable()
    .optional(),
});

// 定例 + 所属組織のメンバーシップを確認する薄いラッパー。
// 定例不存在・組織非所属いずれも 404 で統一し、定例・組織の存在自体を露出させない。
// 組織判定の DB 問い合わせは `middleware/authz.ts` の findOrgMembership に委ね、
// レスポンス文言だけ「定例が見つかりません」で揃える。
async function requireRecurringAccess<T extends RecurringMeeting>(
  c: Context<{ Variables: AuthVariables }>,
  meeting: T | null,
): Promise<{ ok: false; res: Response } | { ok: true; meeting: T }> {
  if (!meeting) {
    return {
      ok: false,
      res: c.json({ error: "定例が見つかりません" }, 404),
    };
  }
  const membership = await findOrgMembership(
    c.var.user,
    meeting.organizationId,
  );
  if (!membership) {
    return {
      ok: false,
      res: c.json({ error: "定例が見つかりません" }, 404),
    };
  }
  return { ok: true, meeting };
}

// メンバー一覧の表示順。MeetingRole は owner / member の 2 値で OrgRole より簡素。
const meetingRoleOrder: Record<MeetingRole, number> = {
  owner: 0,
  member: 1,
};

export const recurringMeetingsRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", auth)
  .post("/:id/meetings", zValidator("json", createMeetingSchema), async (c) => {
    const id = c.req.param("id");
    const { title, heldAt, estimatedDurationMinutes } = c.req.valid("json");

    const meeting = await prisma.recurringMeeting.findUnique({
      where: { id },
    });
    const guard = await requireRecurringAccess(c, meeting);
    if (!guard.ok) return guard.res;

    // estimatedDurationMinutes 未指定なら定例のデフォルト所要時間を採用する。
    // 定例ごとに「だいたい N 分」が決まっている前提のもと、個別 Meeting 側で
    // 必要に応じて上書きできる設計（Issue #155 の設計コンテキスト）。
    const duration =
      estimatedDurationMinutes ?? guard.meeting.defaultDurationMinutes;

    // Service Bus 通知（meeting.created）はここでは送らない。
    // AI 処理（議事録解析）のトリガーは「文字起こし入力時」が正しいトリガーで、
    // 本エンドポイントは「会議の枠」を確保するだけ。Issue #55 で再設計する。
    const created = await prisma.meeting.create({
      data: {
        title,
        heldAt: new Date(heldAt),
        estimatedDurationMinutes: duration,
        recurringMeetingId: id,
      },
      select: {
        id: true,
        title: true,
        heldAt: true,
        estimatedDurationMinutes: true,
        recurringMeetingId: true,
      },
    });
    return c.json(created, 201);
  })
  .get("/:id/tasks", zValidator("query", taskListQuerySchema), async (c) => {
    const id = c.req.param("id");
    const filters = c.req.valid("query");

    // 定例存在チェック → 組織所属確認の順で 404 短絡。
    const meeting = await prisma.recurringMeeting.findUnique({
      where: { id },
    });
    const guard = await requireRecurringAccess(c, meeting);
    if (!guard.ok) return guard.res;

    // 当該定例に attach されたタスクのみ。中間テーブル経由 some 条件で絞る。
    const tasks = await prisma.task.findMany({
      where: {
        ...buildTaskListWhere(filters),
        recurringMeetings: { some: { recurringMeetingId: id } },
      },
      orderBy: taskListOrderBy,
      include: taskListInclude,
    });
    return c.json(tasks.map(serializeTask));
  })
  .get("/:id/meetings", async (c) => {
    const id = c.req.param("id");

    // 定例存在チェック → 組織所属確認の順で 404 短絡。
    // members を取らない軽量クエリで認可だけ通す。
    const meeting = await prisma.recurringMeeting.findUnique({
      where: { id },
    });
    const guard = await requireRecurringAccess(c, meeting);
    if (!guard.ok) return guard.res;

    // レスポンスは「会議一覧」用途に必要な 5 フィールドに限定する。
    // 議事録メタ・タスク・話者などは詳細エンドポイントの責務（別 Issue）。
    const meetings = await prisma.meeting.findMany({
      where: { recurringMeetingId: id },
      orderBy: { heldAt: "desc" },
      select: {
        id: true,
        title: true,
        heldAt: true,
        estimatedDurationMinutes: true,
        recurringMeetingId: true,
      },
    });
    return c.json(meetings);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");

    const meeting = await prisma.recurringMeeting.findUnique({
      where: { id },
      include: {
        members: { include: { user: true } },
      },
    });
    const guard = await requireRecurringAccess(c, meeting);
    if (!guard.ok) return guard.res;

    // owner → member の順、同一ロール内は参加日時昇順で並べる。
    // MeetingRole enum を DB 側で並べる手段がないためメモリ内ソートする。
    const sortedMembers = [...guard.meeting.members].sort((a, b) => {
      if (a.role !== b.role)
        return meetingRoleOrder[a.role] - meetingRoleOrder[b.role];
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    });
    const members = sortedMembers.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      displayName: m.user.displayName,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    // include で取得した members は整形後の配列で置き換えて返す。
    const { members: _members, ...rest } = guard.meeting;
    return c.json({ ...rest, members });
  })
  .patch(
    "/:id",
    zValidator("json", recurringMeetingUpdateSchema),
    async (c) => {
      const id = c.req.param("id");
      const data = c.req.valid("json");

      // 編集は組織メンバー全員に許可（削除のみ MeetingMember.owner 限定）。
      // 定例取得時は members を含めずに済むため include しない軽量クエリ。
      const meeting = await prisma.recurringMeeting.findUnique({
        where: { id },
      });
      const guard = await requireRecurringAccess(c, meeting);
      if (!guard.ok) return guard.res;

      const updated = await prisma.recurringMeeting.update({
        where: { id },
        data,
      });
      return c.json(updated);
    },
  )
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const user = c.var.user;

    const meeting = await prisma.recurringMeeting.findUnique({
      where: { id },
    });
    const guard = await requireRecurringAccess(c, meeting);
    if (!guard.ok) return guard.res;

    // 削除は MeetingMember.owner のみ許可。組織メンバーでも MeetingMember
    // 未参加・member ロールの場合は 403。
    const member = await prisma.meetingMember.findUnique({
      where: {
        recurringMeetingId_userId: {
          recurringMeetingId: id,
          userId: user.id,
        },
      },
    });
    if (!member || member.role !== "owner") {
      return c.json({ error: "定例の削除権限がありません" }, 403);
    }

    // 配下の MeetingMember / Meeting は schema 側で onDelete: Cascade のため
    // delete 一発で連鎖削除される。
    await prisma.recurringMeeting.delete({ where: { id } });
    return c.body(null, 204);
  });
