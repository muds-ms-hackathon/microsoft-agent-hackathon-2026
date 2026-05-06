import { Prisma, type User } from "@prisma/client";
import type { MiddlewareHandler } from "hono";
import { jwtVerify } from "jose";
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
  const email = typeof payload.email === "string" ? payload.email : undefined;
  const name = typeof payload.name === "string" ? payload.name : undefined;

  if (!externalId || !email || !name) {
    return c.json(
      { error: "トークンに必要な claim (sub/email/name) が含まれていません" },
      401,
    );
  }

  // 既存ユーザーは IdP 側で email / name が変更され得るためログイン都度同期する。
  // displayName はユーザーがアプリ側で編集する想定のため update 対象から外す（プロフィール編集 API は別 Issue で対応）。
  // 新規作成時のみ displayName を name で初期化する。
  let user: User;
  try {
    user = await prisma.user.upsert({
      where: { externalId },
      create: { externalId, email, name, displayName: name },
      update: { email, name },
    });
  } catch (e) {
    // email は @unique のため、別ユーザーが既に同一メールを保有している場合は P2002 になる。
    // 利用者向けには「メールが他アカウントで使用中」であることを 409 で返し、500 で握り潰さない。
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return c.json(
        {
          error:
            "このメールアドレスは既に別のアカウントで使用されています",
        },
        409,
      );
    }
    throw e;
  }

  c.set("user", user);
  await next();
};
