import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Context } from "hono";
import { prisma } from "../lib/prisma.js";
import { ambiguousInfoPatchSchema } from "../lib/schemas/review-item.js";
import { auth, type AuthVariables } from "../middleware/auth.js";
import { requireOrgMembership } from "../middleware/authz.js";

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

async function requireAmbiguousInfoAccess(
  c: Context<{ Variables: AuthVariables }>,
  itemId: string,
) {
  const item = await prisma.ambiguousInfo.findUnique({
    where: { id: itemId },
    include: {
      meeting: {
        select: { recurringMeeting: { select: { organizationId: true } } },
      },
    },
  });
  const organizationId = item?.meeting.recurringMeeting?.organizationId;
  if (!item || !organizationId) {
    return {
      ok: false as const,
      res: c.json({ error: "アイテムが見つかりません" }, 404),
    };
  }
  const guard = await requireOrgMembership(c, organizationId);
  if (!guard.ok) return { ok: false as const, res: guard.res };
  return { ok: true as const, item, organizationId };
}

export const ambiguousInfosRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", auth)
  .patch("/:id", zValidator("json", ambiguousInfoPatchSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");

    const access = await requireAmbiguousInfoAccess(c, id);
    if (!access.ok) return access.res;
    const { item, organizationId } = access;

    if (input.status === "rejected") {
      const result = await prisma.$transaction(async (tx) => {
        const { count } = await tx.ambiguousInfo.updateMany({
          where: { id, version: input.version },
          data: { status: "rejected", version: { increment: 1 } },
        });
        if (count === 0) return { kind: "version_conflict" as const };
        const updated = await tx.ambiguousInfo.findUniqueOrThrow({
          where: { id },
        });
        return { kind: "ok" as const, item: updated };
      });
      if (result.kind === "version_conflict") {
        return c.json(
          { error: "他のユーザーが先に更新しました。最新を取得してください" },
          409,
        );
      }
      return c.json(result.item);
    }

    if (input.resolutionType === "discarded") {
      const result = await prisma.$transaction(async (tx) => {
        const { count } = await tx.ambiguousInfo.updateMany({
          where: { id, version: input.version },
          data: {
            status: "resolved",
            resolutionType: "discarded",
            version: { increment: 1 },
          },
        });
        if (count === 0) return { kind: "version_conflict" as const };
        const updated = await tx.ambiguousInfo.findUniqueOrThrow({
          where: { id },
        });
        return { kind: "ok" as const, item: updated };
      });
      if (result.kind === "version_conflict") {
        return c.json(
          { error: "他のユーザーが先に更新しました。最新を取得してください" },
          409,
        );
      }
      return c.json(result.item);
    }

    if (input.resolutionType === "task") {
      const newTaskData = input.newTask ?? {};
      const assigneeUserIds = newTaskData.assigneeUserIds ?? [];
      const recurringMeetingIds = newTaskData.recurringMeetingIds ?? [];

      if (!(await validateAssigneesInOrg(organizationId, assigneeUserIds))) {
        return c.json(
          { error: "担当者は組織のメンバーである必要があります" },
          400,
        );
      }
      if (
        !(await validateRecurringMeetingsInOrg(
          organizationId,
          recurringMeetingIds,
        ))
      ) {
        return c.json({ error: "定例は組織に属している必要があります" }, 400);
      }

      const result = await prisma.$transaction(async (tx) => {
        const task = await tx.task.create({
          data: {
            organizationId,
            title: newTaskData.title ?? item.body,
            body: newTaskData.body,
            status: "todo",
            originMeetingId: item.meetingId,
            dueDate: newTaskData.dueDate
              ? new Date(newTaskData.dueDate)
              : undefined,
          },
        });
        if (assigneeUserIds.length > 0) {
          await tx.taskAssignee.createMany({
            data: assigneeUserIds.map((userId) => ({
              taskId: task.id,
              userId,
            })),
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
        // task 作成後に version チェック → version 不一致ならトランザクション全体をロールバック。
        const { count } = await tx.ambiguousInfo.updateMany({
          where: { id, version: input.version },
          data: {
            status: "resolved",
            resolutionType: "task",
            resolvedToTaskId: task.id,
            version: { increment: 1 },
          },
        });
        if (count === 0) return { kind: "version_conflict" as const };
        const updated = await tx.ambiguousInfo.findUniqueOrThrow({
          where: { id },
          include: { resolvedToTask: { select: { id: true, title: true } } },
        });
        return { kind: "ok" as const, item: updated };
      });

      if (result.kind === "version_conflict") {
        return c.json(
          { error: "他のユーザーが先に更新しました。最新を取得してください" },
          409,
        );
      }
      return c.json(result.item);
    }

    // 未決事項に解決（resolutionType の残る唯一のケース）
    const newDiData = input.newDecisionItem ?? {};

    const result = await prisma.$transaction(async (tx) => {
      const decisionItem = await tx.decisionItem.create({
        data: {
          meetingId: item.meetingId,
          title: newDiData.title ?? item.body,
          body: newDiData.body,
          status: "open",
          decisionState: "open",
        },
      });
      const { count } = await tx.ambiguousInfo.updateMany({
        where: { id, version: input.version },
        data: {
          status: "resolved",
          resolutionType: "decision_item",
          resolvedToDecisionItemId: decisionItem.id,
          version: { increment: 1 },
        },
      });
      if (count === 0) return { kind: "version_conflict" as const };
      const updated = await tx.ambiguousInfo.findUniqueOrThrow({
        where: { id },
        include: {
          resolvedToDecision: { select: { id: true, title: true } },
        },
      });
      return { kind: "ok" as const, item: updated };
    });

    if (result.kind === "version_conflict") {
      return c.json(
        { error: "他のユーザーが先に更新しました。最新を取得してください" },
        409,
      );
    }
    return c.json(result.item);
  });
