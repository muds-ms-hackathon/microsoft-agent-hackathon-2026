import { zValidator } from "@hono/zod-validator";
import type { MeetingRole, RecurringMeeting } from "@prisma/client";
import { Hono } from "hono";
import type { Context } from "hono";
import { prisma } from "../lib/prisma.js";
import { recurringMeetingUpdateSchema } from "../lib/schemas/recurring-meeting.js";
import { auth, type AuthVariables } from "../middleware/auth.js";

// 認証ユーザーが定例の所属組織のメンバーであるかを確認する共通ガード。
// 定例不存在・所属なしいずれも 404 で統一し、組織や定例の存在自体を
// 露出させない（organizations.ts の requireMembership と同方針）。
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
  const user = c.var.user;
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: meeting.organizationId,
      },
    },
  });
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
  );
