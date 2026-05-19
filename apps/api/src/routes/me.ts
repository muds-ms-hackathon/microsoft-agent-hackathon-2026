import { Hono } from "hono";
import { prisma } from "../lib/prisma.js";
import { auth, type AuthVariables } from "../middleware/auth.js";

// 認証ユーザー個人のリソース（招待・通知・プロフィール等）を集約するルート。
// 招待は自分宛 (= user.email と一致) の pending かつ非期限切れのもののみ返す。
// 期限切れの自動 status 遷移はバッチジョブ前提のため、ここでは status=pending の
// うち expiresAt > now でフィルタする（DB 側の status は変えない）。
export const meRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", auth)
  .get("/invitations", async (c) => {
    const user = c.var.user;
    const invitations = await prisma.organizationInvitation.findMany({
      where: {
        email: user.email,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      include: {
        organization: { select: { id: true, name: true } },
        inviter: {
          select: { id: true, name: true, displayName: true, email: true },
        },
      },
    });

    // クライアント向けに必要なフィールドのみ平坦化して返す。
    // organization は { id, name } のみ、inviter は表示用最小セットに絞る。
    const result = invitations.map((inv) => ({
      id: inv.id,
      role: inv.role,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      organization: inv.organization,
      inviter: inv.inviter,
    }));
    return c.json(result);
  });
