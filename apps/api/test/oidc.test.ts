import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAudience,
  getIssuerUrl,
  getJwks,
  getJwksUrl,
  resetJwksCache,
} from "../src/lib/oidc.js";

// process.env への undefined 代入は文字列 "undefined" になるため、復元時は delete を使う
function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe("getIssuerUrl", () => {
  const original = process.env.OIDC_ISSUER_URL;
  afterEach(() => {
    restoreEnv("OIDC_ISSUER_URL", original);
  });

  it("OIDC_ISSUER_URL 未設定時は FakeAuth の既定 URL を返す", () => {
    // biome-ignore lint/performance/noDelete: process.env から真に未設定にするには delete が必要
    delete process.env.OIDC_ISSUER_URL;
    expect(getIssuerUrl()).toBe("http://localhost:3007");
  });

  it("OIDC_ISSUER_URL が設定されていればその値を返す", () => {
    process.env.OIDC_ISSUER_URL = "https://login.example.com";
    expect(getIssuerUrl()).toBe("https://login.example.com");
  });
});

describe("getAudience", () => {
  const original = process.env.OIDC_AUDIENCE;
  afterEach(() => {
    restoreEnv("OIDC_AUDIENCE", original);
  });

  it("OIDC_AUDIENCE 未設定時は FakeAuth の既定 audience を返す", () => {
    // biome-ignore lint/performance/noDelete: process.env から真に未設定にするには delete が必要
    delete process.env.OIDC_AUDIENCE;
    expect(getAudience()).toBe("fake-auth-client");
  });

  it("OIDC_AUDIENCE が設定されていればその値を返す", () => {
    process.env.OIDC_AUDIENCE = "my-api";
    expect(getAudience()).toBe("my-api");
  });
});

describe("getJwksUrl", () => {
  const original = process.env.OIDC_ISSUER_URL;
  afterEach(() => {
    restoreEnv("OIDC_ISSUER_URL", original);
  });

  it("issuer に /.well-known/jwks.json を結合した URL を返す", () => {
    process.env.OIDC_ISSUER_URL = "https://login.example.com";
    expect(getJwksUrl().toString()).toBe(
      "https://login.example.com/.well-known/jwks.json",
    );
  });

  it("issuer 末尾のスラッシュ有無に関わらず同一 URL を返す", () => {
    process.env.OIDC_ISSUER_URL = "https://login.example.com/";
    expect(getJwksUrl().toString()).toBe(
      "https://login.example.com/.well-known/jwks.json",
    );
  });
});

describe("getJwks", () => {
  beforeEach(() => {
    resetJwksCache();
  });

  it("同一インスタンスをキャッシュして返す", () => {
    const a = getJwks();
    const b = getJwks();
    expect(a).toBe(b);
  });

  it("resetJwksCache 後は別インスタンスを返す", () => {
    const a = getJwks();
    resetJwksCache();
    const b = getJwks();
    expect(a).not.toBe(b);
  });
});
