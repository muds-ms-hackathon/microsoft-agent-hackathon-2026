import { createRemoteJWKSet } from "jose";
import { requireEnv } from "./env.js";

// 開発 / テスト時のフォールバック値は services/fake-auth と整合する。
// 本番（Entra ID）では env 必須。NODE_ENV=production で未設定なら起動時に throw する。
const DEFAULT_ISSUER_URL = "http://localhost:3007";
const DEFAULT_AUDIENCE = "fake-auth-client";

export function getIssuerUrl(): string {
  return requireEnv("OIDC_ISSUER_URL", DEFAULT_ISSUER_URL);
}

export function getAudience(): string {
  return requireEnv("OIDC_AUDIENCE", DEFAULT_AUDIENCE);
}

export function getJwksUrl(): URL {
  // issuer の末尾スラッシュ有無に依存しないよう、URL 結合は固定パスで実施する
  const issuer = getIssuerUrl().replace(/\/+$/, "");
  return new URL(`${issuer}/.well-known/jwks.json`);
}

let jwksCache: ReturnType<typeof createRemoteJWKSet> | undefined;

export function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(getJwksUrl());
  }
  return jwksCache;
}

// テスト・env 切り替え時のキャッシュ破棄用
export function resetJwksCache(): void {
  jwksCache = undefined;
}
