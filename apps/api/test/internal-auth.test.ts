import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { internalAuth } from "../src/middleware/internal-auth.js";

function makeApp() {
  const app = new Hono();
  app.use(internalAuth);
  app.get("/ping", (c) => c.json({ ok: true }));
  return app;
}

describe("internalAuth", () => {
  beforeEach(() => {
    process.env.INTERNAL_API_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_SECRET;
  });

  it("(a) 正しいシークレットヘッダがある場合は次の処理に進む", async () => {
    const res = await makeApp().request("/ping", {
      headers: { "x-internal-secret": "test-secret" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("(b) 誤ったシークレットヘッダの場合は 401 を返す", async () => {
    const res = await makeApp().request("/ping", {
      headers: { "x-internal-secret": "wrong-secret" },
    });
    expect(res.status).toBe(401);
  });

  it("(c) ヘッダなしのリクエストは 401 を返す", async () => {
    const res = await makeApp().request("/ping");
    expect(res.status).toBe(401);
  });
});
