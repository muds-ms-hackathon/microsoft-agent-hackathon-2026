import type { Prisma } from "@prisma/client";
import type { Context } from "hono";
import { prisma } from "../lib/prisma.js";
import type { AuthVariables } from "./auth.js";

// 認可検証で取得する meeting 情報。組織判定に必要な最小限の include に揃える。
const meetingAccessInclude = {
  recurringMeeting: { select: { organizationId: true } },
} satisfies Prisma.MeetingInclude;

type MeetingForAccess = Prisma.MeetingGetPayload<{
  include: typeof meetingAccessInclude;
}>;

// 認可検証通過時に呼び出し側へ渡る meeting。recurringMeeting が null でないことを保証する。
type AccessibleMeeting = MeetingForAccess & {
  recurringMeeting: NonNullable<MeetingForAccess["recurringMeeting"]>;
};

export type MeetingAccessResult =
  | {
      ok: true;
      meeting: AccessibleMeeting;
      membership: Prisma.OrganizationMembershipGetPayload<true>;
    }
  | { ok: false; response: Response };

/**
 * /meetings/:id 配下の認可検証を共通化したヘルパー。
 *
 * - meeting を recurringMeeting.organizationId 付きで取得する
 * - 単発会議（recurringMeetingId=null）は組織判定不能のため 404 で拒否する
 * - 認証ユーザーが当該組織のメンバーでなければ 404 で拒否する
 *   （attackable surface を増やさないため 403 ではなく 404 で揃える）
 *
 * 呼び出し側は GET /:id のような追加情報が必要なケースでは、本ヘルパーで認可を
 * 確定したあとに必要な include 付きで再フェッチする想定。
 */
export async function requireMeetingAccess(
  c: Context<{ Variables: AuthVariables }>,
  meetingId: string,
): Promise<MeetingAccessResult> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: meetingAccessInclude,
  });
  if (!meeting?.recurringMeeting) {
    return {
      ok: false,
      response: c.json({ error: "会議が見つかりません" }, 404),
    };
  }

  const user = c.var.user;
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: meeting.recurringMeeting.organizationId,
      },
    },
  });
  if (!membership) {
    return {
      ok: false,
      response: c.json({ error: "会議が見つかりません" }, 404),
    };
  }

  return {
    ok: true,
    meeting: meeting as AccessibleMeeting,
    membership,
  };
}
