import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

// テスト用に毎回 app を組み直すため、import.meta.resolve のキャッシュを避けて動的 import する。
// CORS と onError は app.ts 側のグローバル設定なので、env を差し替えてから import し直す。

const ORIGINAL_ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS;

afterEach(() => {
  if (ORIGINAL_ALLOWED_ORIGINS === undefined) {
    delete process.env.ALLOWED_ORIGINS;
  } else {
    process.env.ALLOWED_ORIGINS = ORIGINAL_ALLOWED_ORIGINS;
  }
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("app.notFound", () => {
  it("未定義パスに対して 404 と JSON エラーを返す", async () => {
    delete process.env.ALLOWED_ORIGINS;
    vi.resetModules();
    const { app } = await import("../src/app.js");
    const res = await app.request("/undefined-path-xyz");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Not Found");
  });
});

describe("app.onError", () => {
  it("ハンドラ内の未捕捉例外を 500 と JSON エラーに変換する", async () => {
    delete process.env.ALLOWED_ORIGINS;
    vi.resetModules();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app: baseApp } = await import("../src/app.js");
    // 既存 app のミドルウェア (onError) を活かしたまま、強制的に throw するルートを追加して検証する
    const testApp = new Hono();
    testApp.onError(baseApp.errorHandler);
    testApp.get("/_explode", () => {
      throw new Error("boom");
    });
    const res = await testApp.request("/_explode");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Internal Server Error");
    expect(consoleSpy).toHaveBeenCalled();
  });
});

describe("CORS ミドルウェア", () => {
  it("ALLOWED_ORIGINS 未設定時は Access-Control-Allow-Origin に * を返す", async () => {
    delete process.env.ALLOWED_ORIGINS;
    vi.resetModules();
    const { app } = await import("../src/app.js");
    const res = await app.request("/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    // hono/cors の preflight は 204 を返す
    expect([200, 204]).toContain(res.status);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("ALLOWED_ORIGINS 設定時は許可オリジンのみ Access-Control-Allow-Origin に反映する", async () => {
    process.env.ALLOWED_ORIGINS =
      "https://app.example.com,https://staging.example.com";
    vi.resetModules();
    const { app } = await import("../src/app.js");
    const allowed = await app.request("/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com",
    );

    const denied = await app.request("/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://malicious.example.com",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("GET レスポンスにも Access-Control-Allow-Origin が付く（実リクエスト）", async () => {
    process.env.ALLOWED_ORIGINS = "https://app.example.com";
    vi.resetModules();
    const { app } = await import("../src/app.js");
    const res = await app.request("/health", {
      headers: { Origin: "https://app.example.com" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example.com",
    );
  });
});
