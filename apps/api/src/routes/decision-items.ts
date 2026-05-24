import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Context } from "hono";
import { prisma } from "../lib/prisma.js";
import { decisionItemUpdateSchema } from "../lib/schemas/decision-item.js";
import {
  decisionItemDetailInclude,
  serializeDecisionItem,
} from "../lib/decision-item-serialization.js";
import { auth, type AuthVariables } from "../middleware/auth.js";
import { requireOrgMembership } from "../middleware/authz.js";

// assigneeUserIds が全員 organizationId のメンバーかを検証する。
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

// DecisionItem を ID から取得し、会議の組織メンバーであることを確認する。
// 不存在・非所属いずれも 404 で統一し、存在自体を露出させない。
async function requireDecisionItemAccess(
  c: Context<{ Variables: AuthVariables }>,
  itemId: string,
) {
  const raw = await prisma.decisionItem.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      status: true,
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
      res: c.json({ error: "決定事項が見つかりません" }, 404),
    };
  }
  const organizationId = raw.meeting.recurringMeeting?.organizationId;
  if (!organizationId) {
    return {
      ok: false as const,
      res: c.json({ error: "決定事項が見つかりません" }, 404),
    };
  }
  const guard = await requireOrgMembership(c, organizationId);
  if (!guard.ok) {
    return { ok: false as const, res: guard.res };
  }
  const { meeting: _meeting, ...item } = raw;
  return { ok: true as const, item, organizationId };
}

export const decisionItemsRoute = new Hono<{
  Variables: AuthVariables;
}>()
  .use("*", auth)
  .patch("/:id", zValidator("json", decisionItemUpdateSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");

    const access = await requireDecisionItemAccess(c, id);
    if (!access.ok) return access.res;

    const { organizationId } = access;

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

    // status が "decided" になったら decidedBy / decidedAt を自動設定。
    // "decided" 以外のステータスへ変わったら decidedBy / decidedAt をクリア。
    const prevStatus = access.item.status;
    const nextStatus = input.status;
    let decidedBy: string | null | undefined;
    let decidedAt: Date | null | undefined;
    if (nextStatus === "decided") {
      decidedBy = c.var.user.id;
      decidedAt = new Date();
    } else if (nextStatus !== undefined && prevStatus === "decided") {
      decidedBy = null;
      decidedAt = null;
    }

    const updateData = {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.body !== undefined && { body: input.body }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.decisionState !== undefined && {
        decisionState: input.decisionState,
      }),
      ...(input.reason !== undefined && { reason: input.reason }),
      ...(input.decisionDeadline !== undefined && {
        decisionDeadline: input.decisionDeadline
          ? new Date(input.decisionDeadline)
          : null,
      }),
      ...(decidedBy !== undefined && { decidedBy }),
      ...(decidedAt !== undefined && { decidedAt }),
      version: { increment: 1 },
    };

    const result = await prisma.$transaction(async (tx) => {
      const { count } = await tx.decisionItem.updateMany({
        where: { id, version: input.version },
        data: updateData,
      });
      if (count === 0) {
        return { kind: "version_conflict" as const };
      }
      if (input.assigneeUserIds !== undefined) {
        await tx.decisionItemAssignee.deleteMany({
          where: { decisionItemId: id },
        });
        if (input.assigneeUserIds.length > 0) {
          await tx.decisionItemAssignee.createMany({
            data: input.assigneeUserIds.map((userId) => ({
              decisionItemId: id,
              userId,
            })),
          });
        }
      }
      const item = await tx.decisionItem.findUniqueOrThrow({
        where: { id },
        include: decisionItemDetailInclude,
      });
      return { kind: "ok" as const, item };
    });

    if (result.kind === "version_conflict") {
      return c.json(
        {
          error: "他のユーザーが先に更新しました。最新を取得してください",
        },
        409,
      );
    }
    return c.json(serializeDecisionItem(result.item));
  });
