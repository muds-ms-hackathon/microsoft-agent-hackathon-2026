import { Prisma, type User } from "@prisma/client";
import type { MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";
import { normalizeEmail } from "../lib/email.js";
import { getAudience, getIssuerUrl, getJwks } from "../lib/oidc.js";
import { prisma } from "../lib/prisma.js";

// auth ミドルウェア通過後、ハンドラから c.var.user で参照できる
export type AuthVariables = {
  user: User;
};

export const auth: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next,
) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json(
      { error: "Authorization: Bearer <token> ヘッダーが必要です" },
      401,
    );
  }
  const token = header.slice("Bearer ".length);

  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
  try {
    const result = await jwtVerify(token, getJwks(), {
      issuer: getIssuerUrl(),
      audience: getAudience(),
    });
    payload = result.payload;
  } catch {
    return c.json({ error: "トークンの検証に失敗しました" }, 401);
  }

  // 自動作成に必要な claim が揃っていることを保証する
  const externalId = typeof payload.sub === "string" ? payload.sub : undefined;
  const rawEmail =
    typeof payload.email === "string" ? payload.email : undefined;
  const name = typeof payload.name === "string" ? payload.name : undefined;

  if (!externalId || !rawEmail || !name) {
    return c.json(
      { error: "トークンに必要な claim (sub/email/name) が含まれていません" },
      401,
    );
  }

  // IdP が返す email は大文字や前後空白を含み得るため、保存前に正規化する。
  // 招待 (`OrganizationInvitation.email`) も同じ normalizeEmail で保存しているため、
  // 比較経路全体で正規化を一貫させる必要がある。
  const email = normalizeEmail(rawEmail);

  // まず findUnique で取得し、差分があるときのみ update / 不在なら create を発行する。
  // upsert を毎リクエスト走らせると、同一ユーザーに対する並列リクエストで
  // 不要な UPDATE 競合を生むため、書き込みは「変更があった時のみ」に絞る。
  // displayName はユーザーがアプリ側で編集する想定のため update 対象から外す
  // （プロフィール編集 API は別 Issue）。新規作成時のみ displayName を name で初期化する。
  let user: User | null;
  try {
    user = await prisma.user.findUnique({ where: { externalId } });
    if (!user) {
      user = await prisma.user.create({
        data: { externalId, email, name, displayName: name },
      });
    } else if (user.email !== email || user.name !== name) {
      user = await prisma.user.update({
        where: { externalId },
        data: { email, name },
      });
    }
  } catch (e) {
    // email は @unique のため、別ユーザーが既に同一メールを保有している場合は P2002 になる。
    // create / update いずれで起きても 409 で利用者向けに通知する。
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return c.json(
        {
          error: "このメールアドレスは既に別のアカウントで使用されています",
        },
        409,
      );
    }
    throw e;
  }

  c.set("user", user);
  await next();
};
