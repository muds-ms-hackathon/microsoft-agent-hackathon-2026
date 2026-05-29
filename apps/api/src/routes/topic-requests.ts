import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Context } from "hono";
import { prisma } from "../lib/prisma.js";
import { topicRequestUpdateSchema } from "../lib/schemas/topic-request.js";
import { auth, type AuthVariables } from "../middleware/auth.js";
import { requireOrgMembership } from "../middleware/authz.js";

// 単体 TopicRequest を取得し、組織メンバーシップを確認するヘルパー。
// 認可 NG / 不存在いずれも 404 で揃え、リソース存在の露出を避ける。
async function requireTopicRequestAccess(
  c: Context<{ Variables: AuthVariables }>,
  topicRequestId: string,
) {
  const topicRequest = await prisma.topicRequest.findUnique({
    where: { id: topicRequestId },
    include: {
      meeting: {
        include: { recurringMeeting: { select: { organizationId: true } } },
      },
    },
  });
  if (!topicRequest?.meeting.recurringMeeting) {
    return {
      ok: false as const,
      res: c.json({ error: "議題が見つかりません" }, 404),
    };
  }
  const guard = await requireOrgMembership(
    c,
    topicRequest.meeting.recurringMeeting.organizationId,
  );
  if (!guard.ok) {
    // 組織不一致でも露出を避けるため、メッセージを「議題が見つかりません」に差し替える。
    return {
      ok: false as const,
      res: c.json({ error: "議題が見つかりません" }, 404),
    };
  }
  return { ok: true as const, topicRequest };
}

export const topicRequestsRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", auth)
  .patch("/:id", zValidator("json", topicRequestUpdateSchema), async (c) => {
    const id = c.req.param("id");
    const input = c.req.valid("json");

    const access = await requireTopicRequestAccess(c, id);
    if (!access.ok) return access.res;

    // undefined はスキップ、null は明示的なクリアとして扱う。
    const updateData: Record<string, unknown> = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.body !== undefined) updateData.body = input.body;
    if (input.priority !== undefined) updateData.priority = input.priority;

    const updated = await prisma.topicRequest.update({
      where: { id },
      data: updateData,
    });
    return c.json(updated);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const access = await requireTopicRequestAccess(c, id);
    if (!access.ok) return access.res;

    await prisma.topicRequest.delete({ where: { id } });
    return c.body(null, 204);
  });
