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

// 後方互換 / フォールバック用: issuer から推測した JWKS URL を返す（同期）。
// fake-auth のように /.well-known/jwks.json が標準パスのプロバイダで使用する。
export function getJwksUrl(): URL {
  const issuer = getIssuerUrl().replace(/\/+$/, "");
  return new URL(`${issuer}/.well-known/jwks.json`);
}

// openid-configuration の jwks_uri を優先的に使用する。
// プロバイダによって JWKS エンドポイントのパスが異なるため（例: Entra External ID は
// /discovery/v2.0/keys）、ディスカバリドキュメントから jwks_uri を取得する。
// ディスカバリ失敗時は getJwksUrl() の推測パスにフォールバックする。
// Promise としてキャッシュし、複数リクエストで重複フェッチしない。
let jwksCachePromise:
  | Promise<ReturnType<typeof createRemoteJWKSet>>
  | undefined;

export async function getJwks(): Promise<
  ReturnType<typeof createRemoteJWKSet>
> {
  if (!jwksCachePromise) {
    jwksCachePromise = (async () => {
      const issuer = getIssuerUrl().replace(/\/+$/, "");
      const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
      try {
        const res = await fetch(discoveryUrl);
        if (res.ok) {
          const config = (await res.json()) as { jwks_uri?: string };
          if (typeof config.jwks_uri === "string") {
            return createRemoteJWKSet(new URL(config.jwks_uri));
          }
        }
      } catch {
        // ネットワーク不達等のディスカバリ失敗はフォールバックで継続
      }
      return createRemoteJWKSet(getJwksUrl());
    })();
  }
  return jwksCachePromise;
}

// テスト・env 切り替え時のキャッシュ破棄用
export function resetJwksCache(): void {
  jwksCachePromise = undefined;
}
