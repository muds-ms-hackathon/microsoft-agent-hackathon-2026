import { zValidator } from "@hono/zod-validator";
import { Prisma } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { normalizeEmail } from "../lib/email.js";
import { auth, type AuthVariables } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

// 認証ユーザー個人のリソース（招待・通知・プロフィール等）を集約するルート。
// 招待は自分宛 (= user.email と一致) の pending かつ非期限切れのもののみ返す。
// 期限切れの自動 status 遷移はバッチジョブ前提のため、ここでは status=pending の
// うち expiresAt > now でフィルタする（DB 側の status は変えない）。
// email が null のユーザー（Entra で email クレームが返らなかった場合）は
// 招待照合の前提となるメールが存在しないため、空配列を返す。
export const meRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", auth)
  .get("/invitations", async (c) => {
    const user = c.var.user;
    if (!user.email) {
      return c.json([]);
    }
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
  })
  .patch(
    "/",
    zValidator("json", z.object({ email: z.string().email() })),
    async (c) => {
      const { email } = c.req.valid("json");
      const user = c.var.user;
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { email: normalizeEmail(email) },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002"
        ) {
          return c.json({ error: "このメールアドレスは既に使用されています" }, 409);
        }
        throw e;
      }
      return c.json({ success: true });
    },
  );
