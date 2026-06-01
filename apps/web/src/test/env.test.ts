import { describe, expect, it } from "vitest";
import { readRequiredViteEnv, resolveApiBaseUrl } from "../lib/env";

// vitest は `import.meta.env` の差し替えが面倒なため、関数引数として
// 任意の env を注入できる API に対し、必要最小限のオブジェクトを
// 組み立てて検証する。
function buildEnv(overrides: Partial<ImportMetaEnv>): ImportMetaEnv {
  return {
    MODE: "test",
    BASE_URL: "/",
    DEV: false,
    PROD: false,
    SSR: false,
    ...overrides,
  } as ImportMetaEnv;
}

describe("readRequiredViteEnv", () => {
  it("PROD かつ値が設定されていればその値を返す", () => {
    const env = buildEnv({
      PROD: true,
      VITE_FAKE_AUTH_URL: "https://auth.example.com",
    });

    expect(
      readRequiredViteEnv("VITE_FAKE_AUTH_URL", "http://localhost:3007", env),
    ).toBe("https://auth.example.com");
  });

  it("PROD かつ未設定なら key 名を含む Error を throw する", () => {
    const env = buildEnv({ PROD: true });

    expect(() =>
      readRequiredViteEnv("VITE_FAKE_AUTH_URL", "http://localhost:3007", env),
    ).toThrow(/VITE_FAKE_AUTH_URL/);
  });

  it("PROD かつ空文字は未設定とみなして throw する", () => {
    const env = buildEnv({ PROD: true, VITE_FAKE_AUTH_URL: "" });

    expect(() =>
      readRequiredViteEnv("VITE_FAKE_AUTH_URL", "http://localhost:3007", env),
    ).toThrow(/VITE_FAKE_AUTH_URL/);
  });

  it("DEV かつ値が設定されていればその値を返す", () => {
    const env = buildEnv({
      PROD: false,
      DEV: true,
      VITE_FAKE_AUTH_URL: "https://staging.example.com",
    });

    expect(
      readRequiredViteEnv("VITE_FAKE_AUTH_URL", "http://localhost:3007", env),
    ).toBe("https://staging.example.com");
  });

  it("DEV かつ未設定なら devFallback を返す", () => {
    const env = buildEnv({ PROD: false, DEV: true });

    expect(
      readRequiredViteEnv("VITE_FAKE_AUTH_URL", "http://localhost:3007", env),
    ).toBe("http://localhost:3007");
  });

  it("DEV かつ空文字も未設定とみなして devFallback を返す", () => {
    const env = buildEnv({
      PROD: false,
      DEV: true,
      VITE_FAKE_AUTH_URL: "",
    });

    expect(
      readRequiredViteEnv("VITE_FAKE_AUTH_URL", "http://localhost:3007", env),
    ).toBe("http://localhost:3007");
  });
});

describe("resolveApiBaseUrl", () => {
  it("undefined は /api を返す", () => {
    expect(resolveApiBaseUrl(undefined)).toBe("/api");
  });

  it("空文字は /api を返す", () => {
    expect(resolveApiBaseUrl("")).toBe("/api");
  });

  it("空白のみは /api を返す", () => {
    expect(resolveApiBaseUrl("   ")).toBe("/api");
  });

  it("末尾スラッシュを除去する", () => {
    expect(resolveApiBaseUrl("https://example.com/")).toBe(
      "https://example.com",
    );
  });

  it("末尾スラッシュが複数あっても除去する", () => {
    expect(resolveApiBaseUrl("https://example.com///")).toBe(
      "https://example.com",
    );
  });

  it("正常な URL はそのまま返す", () => {
    expect(resolveApiBaseUrl("https://example.com")).toBe(
      "https://example.com",
    );
  });

  it("前後の空白を trim してから解決する", () => {
    expect(resolveApiBaseUrl("  https://example.com  ")).toBe(
      "https://example.com",
    );
  });
});
