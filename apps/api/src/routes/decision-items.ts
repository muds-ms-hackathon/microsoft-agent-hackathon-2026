import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Context } from "hono";
import { prisma } from "../lib/prisma.js";
import { validateAssigneesInOrg } from "../lib/org-validation.js";
import {
  decisionItemReviewInclude,
  serializeDecisionItem,
} from "../lib/review-item-serialization.js";
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

    // 一般編集 UI からの誤用防止。draft へは decided/open/cancelled からのみ遷移可。
    // draft/reviewing（AI処理中）からは戻せない。task と異なり in_progress/done 相当の
    // 概念がないため、決定済み・未決・却下済みの3状態を対象にしている。
    if (input.status === "draft") {
      const current = access.item.status;
      if (
        current !== "decided" &&
        current !== "open" &&
        current !== "cancelled"
      ) {
        return c.json(
          { error: "この状態からレビュー待ちに戻すことはできません" },
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
      ...(input.status !== undefined && { status: input.status }),
      ...(input.decisionState !== undefined && {
        decisionState: input.decisionState,
      }),
      ...(input.reason !== undefined && { reason: input.reason }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.body !== undefined && { body: input.body }),
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
        include: decisionItemReviewInclude,
      });
      return { kind: "ok" as const, item: updated };
    });

    if (result.kind === "version_conflict") {
      return c.json(
        { error: "他のユーザーが先に更新しました。最新を取得してください" },
        409,
      );
    }

    return c.json(serializeDecisionItem(result.item));
  });
