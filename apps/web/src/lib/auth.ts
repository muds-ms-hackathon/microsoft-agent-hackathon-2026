// 認証状態の管理（ローカル fake-auth 連携用の暫定実装）。
//
// 保存方式: id_token を localStorage に保存する。XSS 経由で盗取される
// リスクがあるため、本番 (Entra ID) 切替時には httpOnly Cookie + BFF
// 構成へ移行する。本ファイルの公開 API（getIdToken / loginAtom 等）は
// 移行後も呼び出し側に閉じた変更だけで済むよう、保存実装を内部に隠蔽
// しておく。
//
// 真実源: localStorage を真実源、authAtom を UI 用キャッシュとして扱う。
// 初期化時のみ getInitialState() で localStorage から復元する設計のため、
// 他タブからの変更や直接の localStorage 操作で両者が乖離する余地は残る。
// atomWithStorage 等で根本解消する作業は別途 Issue (#80) で進める。

import { atom } from "jotai";

const ID_TOKEN_KEY = "id_token";

export interface AuthState {
  isAuthenticated: boolean;
  idToken: string | null;
  user: {
    sub: string;
    email: string;
    name: string;
  } | null;
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ID_TOKEN_KEY);
}

function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(ID_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ID_TOKEN_KEY);
  }
}

// JWT のペイロードは Base64URL（RFC 7515）でエンコードされており、
// 標準 Base64 とは `-`/`_` および省略パディングの扱いが異なる。
// また `atob` の戻り値はバイナリ文字列なので UTF-8 として再デコードする必要がある。
function decodeBase64UrlJson(part: string): unknown {
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function parseToken(token: string): AuthState["user"] {
  try {
    const payload = decodeBase64UrlJson(token.split(".")[1]) as {
      sub: string;
      email: string;
      name: string;
      exp?: number;
    };
    // OIDC 仕様で exp は ID トークンの必須クレーム。
    // 欠落 or 期限切れの場合はトークン全体を無効とみなす。
    if (typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000) {
      return null;
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

export function getInitialState(): AuthState {
  const token = getStoredToken();
  if (token) {
    const user = parseToken(token);
    if (user) {
      return {
        isAuthenticated: true,
        idToken: token,
        user,
      };
    }
    // 期限切れ等で復元できないトークンはここで破棄しておくと
    // 次回以降のガードがログインループに陥らない。
    setStoredToken(null);
  }
  return {
    isAuthenticated: false,
    idToken: null,
    user: null,
  };
}

export const authAtom = atom<AuthState>(getInitialState());

export const loginAtom = atom(null, (_get, set, token: string) => {
  setStoredToken(token);
  const user = parseToken(token);
  set(authAtom, {
    isAuthenticated: !!user,
    idToken: token,
    user,
  });
});

export const logoutAtom = atom(null, (_get, set) => {
  setStoredToken(null);
  set(authAtom, {
    isAuthenticated: false,
    idToken: null,
    user: null,
  });
});

export function getIdToken(): string | null {
  return getStoredToken();
}

// ---- OIDC implicit flow の state / nonce 検証 ----------------------------
//
// /authorize リクエスト発行直前に saveExpectedAuthParams で sessionStorage に
// 期待値を退避し、コールバック側で verifyAndConsumeAuthParams により照合する。
// 別タブで /login を同時に開いた場合は最後の値で上書きされる前提（ローカル
// fake-auth 用途では実害が小さく、Entra ID 移行時に再設計予定）。

const EXPECTED_STATE_KEY = "expected_state";
const EXPECTED_NONCE_KEY = "expected_nonce";

export function saveExpectedAuthParams(state: string, nonce: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(EXPECTED_STATE_KEY, state);
  sessionStorage.setItem(EXPECTED_NONCE_KEY, nonce);
}

export function getTokenNonce(token: string): string | null {
  try {
    const payload = decodeBase64UrlJson(token.split(".")[1]) as {
      nonce?: string;
    };
    return typeof payload.nonce === "string" ? payload.nonce : null;
  } catch {
    return null;
  }
}

export type AuthCallbackVerificationReason =
  | "no_expected_params"
  | "state_mismatch"
  | "nonce_mismatch";

export interface AuthCallbackVerification {
  ok: boolean;
  reason?: AuthCallbackVerificationReason;
}

export function verifyAndConsumeAuthParams(
  actualState: string | null,
  idToken: string,
): AuthCallbackVerification {
  if (typeof window === "undefined") {
    return { ok: false, reason: "no_expected_params" };
  }
  const expectedState = sessionStorage.getItem(EXPECTED_STATE_KEY);
  const expectedNonce = sessionStorage.getItem(EXPECTED_NONCE_KEY);
  // 検証は 1 回限り。リプレイ防止のため成否によらず期待値は破棄する。
  sessionStorage.removeItem(EXPECTED_STATE_KEY);
  sessionStorage.removeItem(EXPECTED_NONCE_KEY);

  if (!expectedState || !expectedNonce) {
    return { ok: false, reason: "no_expected_params" };
  }
  if (actualState !== expectedState) {
    return { ok: false, reason: "state_mismatch" };
  }
  if (getTokenNonce(idToken) !== expectedNonce) {
    return { ok: false, reason: "nonce_mismatch" };
  }
  return { ok: true };
}
