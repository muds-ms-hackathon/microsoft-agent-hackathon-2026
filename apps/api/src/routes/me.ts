import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, type AuthVariables } from "../middleware/auth.js";

// 表示用に公開するプロフィールのフィールド。秘匿情報 (externalId 等) は含めない。
const profileSelect = {
  id: true,
  email: true,
  name: true,
  displayName: true,
} as const;

// プロフィール更新の入力スキーマ。現状は表示名のみ編集可能。
const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(1, "表示名を入力してください")
    .max(50, "表示名は50文字以内で入力してください"),
});

// 認証ユーザー個人のリソース（招待・通知・プロフィール等）を集約するルート。
// 招待は自分宛 (= user.email と一致) の pending かつ非期限切れのもののみ返す。
// 期限切れの自動 status 遷移はバッチジョブ前提のため、ここでは status=pending の
// うち expiresAt > now でフィルタする（DB 側の status は変えない）。
export const meRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", auth)
  .get("/", async (c) => {
    // 認証ミドルウェアが解決済みの自分自身のプロフィールを返す。
    // displayName は JWT に含まれないため、設定画面はこのエンドポイントで取得する。
    const user = c.var.user;
    return c.json({
      id: user.id,
      email: user.email,
      name: user.name,
      displayName: user.displayName,
    });
  })
  .patch("/", zValidator("json", updateProfileSchema), async (c) => {
    // 表示名を更新する。更新対象は常に認証ユーザー自身 (user.id) に限定する。
    const user = c.var.user;
    const { displayName } = c.req.valid("json");
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { displayName },
      select: profileSelect,
    });
    return c.json(updated);
  })
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
