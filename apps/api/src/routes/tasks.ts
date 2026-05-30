import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Context } from "hono";
import { prisma } from "../lib/prisma.js";
import { markTaskRead } from "../lib/read-log.js";
import {
  buildTaskListWhere,
  taskCreateSchema,
  taskListQuerySchema,
  taskUpdateSchema,
} from "../lib/schemas/task.js";
import {
  serializeTask,
  taskDetailInclude,
  taskListInclude,
  taskListOrderBy,
  type TaskWithDetail,
} from "../lib/task-serialization.js";
import { auth, type AuthVariables } from "../middleware/auth.js";
import { requireOrgMembership } from "../middleware/authz.js";

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

// task を ID から取得し、当該組織のメンバーであることを確認する。
// Task 不存在・組織非所属いずれも 404 で統一し、存在自体を露出させない。
async function requireTaskAccess(
  c: Context<{ Variables: AuthVariables }>,
  taskId: string,
): Promise<{ ok: true; task: TaskWithDetail } | { ok: false; res: Response }> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: taskDetailInclude,
  });
  if (!task) {
    return { ok: false, res: c.json({ error: "タスクが見つかりません" }, 404) };
  }
  const guard = await requireOrgMembership(c, task.organizationId);
  if (!guard.ok) return guard;
  return { ok: true, task };
}

export const tasksRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", auth)
  .get("/me", zValidator("query", taskListQuerySchema), async (c) => {
    const user = c.var.user;
    const filters = c.req.valid("query");

    // 自分が assignee の全組織横断タスクを返す。組織所属確認は不要
    // （assignees 経由のスコープでユーザー自身に閉じている）。
    const tasks = await prisma.task.findMany({
      where: {
        ...buildTaskListWhere(filters),
        assignees: { some: { userId: user.id } },
      },
      orderBy: taskListOrderBy,
      include: taskListInclude,
    });
    return c.json(tasks.map(serializeTask));
  })
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
      // 直前に作成済みなので必ず存在する。型上も null を排除するため findUniqueOrThrow を使う。
      return tx.task.findUniqueOrThrow({
        where: { id: task.id },
        include: taskDetailInclude,
      });
    });

    return c.json(serializeTask(created), 201);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const guard = await requireTaskAccess(c, id);
    if (!guard.ok) return guard.res;
    return c.json(serializeTask(guard.task));
  })
  .patch("/:id", zValidator("json", taskUpdateSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");

    const guard = await requireTaskAccess(c, id);
    if (!guard.ok) return guard.res;

    const organizationId = guard.task.organizationId;

    // 一般編集 UI からの誤用防止。draft へは todo/rejected からのみ遷移可。
    // in_progress/done は作業・完了履歴が混乱するため再レビュー対象にしない。
    if (input.status === "draft") {
      const current = guard.task.status;
      if (current !== "todo" && current !== "rejected") {
        return c.json(
          { error: "この状態からレビュー待ちに戻すことはできません" },
          400,
        );
      }
    }

    // assignees / recurringMeetings の置換が指定されたら、クロス組織を再検証する。
    // 作成時と同じ整合性ルール（同一組織内のみ許可）。
    if (input.assigneeUserIds !== undefined) {
      if (
        !(await validateAssigneesInOrg(organizationId, input.assigneeUserIds))
      ) {
        return c.json(
          { error: "担当者は組織のメンバーである必要があります" },
          400,
        );
      }
    }
    if (input.recurringMeetingIds !== undefined) {
      if (
        !(await validateRecurringMeetingsInOrg(
          organizationId,
          input.recurringMeetingIds,
        ))
      ) {
        return c.json({ error: "定例は組織に属している必要があります" }, 400);
      }
    }
    if (input.originMeetingId) {
      const ok = await validateOriginMeetingInOrg(
        organizationId,
        input.originMeetingId,
      );
      if (!ok) {
        return c.json(
          { error: "発生源会議が見つからないか組織に属していません" },
          400,
        );
      }
    }

    // 楽観的ロック: where に id + version を指定して updateMany し、
    // count === 0 なら version 不一致として 409。Prisma の単一 update は
    // id + version の AND を unique 制約として扱えないため updateMany を使う。
    const updateData = {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.body !== undefined && { body: input.body }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.priority !== undefined && { priority: input.priority }),
      ...(input.originMeetingId !== undefined && {
        originMeetingId: input.originMeetingId,
      }),
      ...(input.dueDate !== undefined && {
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      }),
      ...(input.startDate !== undefined && {
        startDate: input.startDate ? new Date(input.startDate) : null,
      }),
      ...(input.followUpDate !== undefined && {
        followUpDate: input.followUpDate ? new Date(input.followUpDate) : null,
      }),
      version: { increment: 1 },
    };

    const result = await prisma.$transaction(async (tx) => {
      const { count } = await tx.task.updateMany({
        where: { id, version: input.version },
        data: updateData,
      });
      if (count === 0) {
        return { kind: "version_conflict" as const };
      }
      // assignees / recurringMeetings の全置換。undefined ならスキップ。
      if (input.assigneeUserIds !== undefined) {
        await tx.taskAssignee.deleteMany({ where: { taskId: id } });
        if (input.assigneeUserIds.length > 0) {
          await tx.taskAssignee.createMany({
            data: input.assigneeUserIds.map((userId) => ({
              taskId: id,
              userId,
            })),
          });
        }
      }
      if (input.recurringMeetingIds !== undefined) {
        await tx.taskRecurringMeeting.deleteMany({ where: { taskId: id } });
        if (input.recurringMeetingIds.length > 0) {
          await tx.taskRecurringMeeting.createMany({
            data: input.recurringMeetingIds.map((recurringMeetingId) => ({
              taskId: id,
              recurringMeetingId,
            })),
          });
        }
      }
      // updateMany が count > 0 を返した直後なので必ず存在する。
      const task = await tx.task.findUniqueOrThrow({
        where: { id },
        include: taskDetailInclude,
      });
      return { kind: "ok" as const, task };
    });

    if (result.kind === "version_conflict") {
      return c.json(
        { error: "他のユーザーが先に更新しました。最新を取得してください" },
        409,
      );
    }
    return c.json(serializeTask(result.task));
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const guard = await requireTaskAccess(c, id);
    if (!guard.ok) return guard.res;

    // 配下の TaskAssignee / TaskRecurringMeeting は schema 側で onDelete: Cascade のため
    // delete 一発で連鎖削除される。削除済みボディは返さず 204 で統一。
    await prisma.task.delete({ where: { id } });
    return c.body(null, 204);
  })
  .post("/:id/read", async (c) => {
    const id = c.req.param("id");
    // 既読化は組織メンバーのみ許可。不存在・非所属は 404 で統一する。
    const guard = await requireTaskAccess(c, id);
    if (!guard.ok) return guard.res;

    await markTaskRead(c.var.user.id, id);
    return c.body(null, 204);
  });
