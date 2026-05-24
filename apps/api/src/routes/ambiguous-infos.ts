import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Context } from "hono";
import { prisma } from "../lib/prisma.js";
import { ambiguousInfoUpdateSchema } from "../lib/schemas/ambiguous-info.js";
import { auth, type AuthVariables } from "../middleware/auth.js";
import { requireOrgMembership } from "../middleware/authz.js";

// AmbiguousInfo を ID から取得し、会議の組織メンバーであることを確認する。
// 不存在・非所属いずれも 404 で統一し、存在自体を露出させない。
async function requireAmbiguousInfoAccess(
  c: Context<{ Variables: AuthVariables }>,
  infoId: string,
) {
  const raw = await prisma.ambiguousInfo.findUnique({
    where: { id: infoId },
    select: {
      id: true,
      meetingId: true,
      meeting: {
        select: {
          recurringMeeting: { select: { organizationId: true } },
        },
      },
    },
  });
  if (!raw) {
    return {
      ok: false as const,
      res: c.json({ error: "曖昧情報が見つかりません" }, 404),
    };
  }
  const organizationId = raw.meeting.recurringMeeting?.organizationId;
  if (!organizationId) {
    return {
      ok: false as const,
      res: c.json({ error: "曖昧情報が見つかりません" }, 404),
    };
  }
  const guard = await requireOrgMembership(c, organizationId);
  if (!guard.ok) {
    return { ok: false as const, res: guard.res };
  }
  const { meeting: _meeting, ...info } = raw;
  return { ok: true as const, info };
}

// resolvedToTaskId が同一会議内のタスク（originMeetingId 一致）かを検証する。
async function validateResolvedToTask(
  meetingId: string,
  taskId: string,
): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { originMeetingId: true },
  });
  return task?.originMeetingId === meetingId;
}

// resolvedToDecisionItemId が同一会議内の決定事項かを検証する。
async function validateResolvedToDecisionItem(
  meetingId: string,
  decisionItemId: string,
): Promise<boolean> {
  const item = await prisma.decisionItem.findUnique({
    where: { id: decisionItemId },
    select: { meetingId: true },
  });
  return item?.meetingId === meetingId;
}

export const ambiguousInfosRoute = new Hono<{
  Variables: AuthVariables;
}>()
  .use("*", auth)
  .patch("/:id", zValidator("json", ambiguousInfoUpdateSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");

    const access = await requireAmbiguousInfoAccess(c, id);
    if (!access.ok) return access.res;

    const { meetingId } = access.info;

    // 解消先タスクは同一会議から抽出されたものに限定する。
    if (input.resolvedToTaskId) {
      const valid = await validateResolvedToTask(
        meetingId,
        input.resolvedToTaskId,
      );
      if (!valid) {
        return c.json({ error: "解消先タスクが同一会議に属していません" }, 400);
      }
    }

    // 解消先決定事項は同一会議のものに限定する。
    if (input.resolvedToDecisionItemId) {
      const valid = await validateResolvedToDecisionItem(
        meetingId,
        input.resolvedToDecisionItemId,
      );
      if (!valid) {
        return c.json(
          { error: "解消先決定事項が同一会議に属していません" },
          400,
        );
      }
    }

    const updateData = {
      ...(input.status !== undefined && { status: input.status }),
      ...(input.resolutionType !== undefined && {
        resolutionType: input.resolutionType,
      }),
      ...(input.resolvedToTaskId !== undefined && {
        resolvedToTaskId: input.resolvedToTaskId,
      }),
      ...(input.resolvedToDecisionItemId !== undefined && {
        resolvedToDecisionItemId: input.resolvedToDecisionItemId,
      }),
      version: { increment: 1 },
    };

    const { count } = await prisma.ambiguousInfo.updateMany({
      where: { id, version: input.version },
      data: updateData,
    });
    if (count === 0) {
      return c.json(
        {
          error: "他のユーザーが先に更新しました。最新を取得してください",
        },
        409,
      );
    }

    const updated = await prisma.ambiguousInfo.findUniqueOrThrow({
      where: { id },
    });
    return c.json(updated);
  });
