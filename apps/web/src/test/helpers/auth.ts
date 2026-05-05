// テスト用の偽 ID トークンを組み立てるヘルパー。
// 署名は付与せず、`alg: none` の JWT 互換フォーマット（Base64URL）を返す。

export interface FakeIdTokenPayload {
  sub: string;
  email: string;
  name: string;
  // UNIX 秒。未指定時は 1 時間後を期限とする。
  exp?: number;
  // OIDC 検証用。未指定時は省略する。
  nonce?: string;
  [key: string]: unknown;
}

function base64UrlEncode(value: unknown): string {
  const json = JSON.stringify(value);
  // 多バイト文字（日本語等）を含むペイロードでも壊れないよう UTF-8 経由で encode する
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function makeFakeIdToken(payload: FakeIdTokenPayload): string {
  const exp = payload.exp ?? Math.floor(Date.now() / 1000) + 60 * 60;
  const fullPayload = { ...payload, exp };
  const header = base64UrlEncode({ alg: "none", typ: "JWT" });
  const body = base64UrlEncode(fullPayload);
  return `${header}.${body}.`;
}
