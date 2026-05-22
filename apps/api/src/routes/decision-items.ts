import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Context } from "hono";
import { prisma } from "../lib/prisma.js";
import { validateAssigneesInOrg } from "../lib/org-validation.js";
import { decisionItemPatchSchema } from "../lib/schemas/review-item.js";
import { auth, type AuthVariables } from "../middleware/auth.js";
import { requireOrgMembership } from "../middleware/authz.js";

async function requireDecisionItemAccess(
  c: Context<{ Variables: AuthVariables }>,
  itemId: string,
) {
  const item = await prisma.decisionItem.findUnique({
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

export const decisionItemsRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", auth)
  .patch("/:id", zValidator("json", decisionItemPatchSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");

    const access = await requireDecisionItemAccess(c, id);
    if (!access.ok) return access.res;

    if (input.assigneeUserIds !== undefined) {
      if (
        !(await validateAssigneesInOrg(
          access.organizationId,
          input.assigneeUserIds,
        ))
      ) {
        return c.json(
          { error: "担当者は組織のメンバーである必要があります" },
          400,
        );
      }
    }

    const updateData = {
      ...(input.status !== undefined && { status: input.status }),
      ...(input.decisionState !== undefined && {
        decisionState: input.decisionState,
      }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.body !== undefined && { body: input.body }),
      ...(input.decisionDeadline !== undefined && {
        decisionDeadline: input.decisionDeadline
          ? new Date(input.decisionDeadline)
          : null,
      }),
      version: { increment: 1 },
    };

    const result = await prisma.$transaction(async (tx) => {
      const { count } = await tx.decisionItem.updateMany({
        where: { id, version: input.version },
        data: updateData,
      });
      if (count === 0) return { kind: "version_conflict" as const };

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

      const updated = await tx.decisionItem.findUniqueOrThrow({
        where: { id },
        include: {
          assignees: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  email: true,
                },
              },
            },
          },
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

    const { assignees, ...rest } = result.item;
    return c.json({ ...rest, assignees: assignees.map((a) => a.user) });
  });
