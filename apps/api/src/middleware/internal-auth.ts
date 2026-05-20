import type { MiddlewareHandler } from "hono";

export const internalAuth: MiddlewareHandler = async (c, next) => {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    return c.json({ error: "INTERNAL_API_SECRET が未設定です" }, 500);
  }

  const header = c.req.header("x-internal-secret");
  if (header !== secret) {
    return c.json({ error: "認証に失敗しました" }, 401);
  }

  await next();
};
