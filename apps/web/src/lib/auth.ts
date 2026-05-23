// 認証状態の管理（ローカル fake-auth 連携用の暫定実装）。
//
// 保存方式: id_token を localStorage に保存する。XSS 経由で盗取される
// リスクがあるため、本番 (Entra ID) 切替時には httpOnly Cookie + BFF
// 構成へ移行する。本ファイルの公開 API（getIdToken / loginAtom 等）は
// 移行後も呼び出し側に閉じた変更だけで済むよう、保存実装を内部に隠蔽
// しておく。
//
// 真実源: localStorage（id_token キー）に一本化する。authAtom はそこから
// 派生する読み取り専用 atom であり、storage イベント購読により他タブの
// ログイン／ログアウトにも追従する。書き込みは loginAtom / logoutAtom が
// 内部の idTokenAtom（atomWithStorage）を介して行うため、UI と localStorage
// の二重管理は構造的に発生しない。

import { type Atom, atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { clearCurrentOrganizationIdAtom } from "./currentOrganization";

// jotai/utils は SyncStorage 型を public な entry point から再エクスポートして
// いないため、atomWithStorage が受け付ける形に合わせてローカルで定義する。
// （raw 文字列を扱う storage を実装するための最小定義に留める）
type IdTokenStorage = {
  getItem: (key: string, initialValue: string | null) => string | null;
  setItem: (key: string, newValue: string | null) => void;
  removeItem: (key: string) => void;
  subscribe: (
    key: string,
    callback: (value: string | null) => void,
    initialValue: string | null,
  ) => (() => void) | undefined;
};

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

const UNAUTHENTICATED: AuthState = {
  isAuthenticated: false,
  idToken: null,
  user: null,
};

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ID_TOKEN_KEY);
}

function removeStoredToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ID_TOKEN_KEY);
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
      email?: string;
      preferred_username?: string;
      name: string;
      exp?: number;
    };
    // OIDC 仕様で exp は ID トークンの必須クレーム。
    // 欠落 or 期限切れの場合はトークン全体を無効とみなす。
    if (typeof payload.exp !== "number" || payload.exp <= Date.now() / 1000) {
      return null;
    }
    // Entra External ID は email クレームが省略され preferred_username に入る場合がある。
    // バックエンド auth ミドルウェアと同じ優先順位でフォールバックする。
    const email =
      typeof payload.email === "string"
        ? payload.email
        : typeof payload.preferred_username === "string"
          ? payload.preferred_username
          : undefined;
    if (!email) return null;
    return { sub: payload.sub, email, name: payload.name };
  } catch {
    return null;
  }
}

function deriveAuthState(token: string | null): AuthState {
  if (!token) return UNAUTHENTICATED;
  const user = parseToken(token);
  if (!user) return UNAUTHENTICATED;
  return { isAuthenticated: true, idToken: token, user };
}

export function getInitialState(): AuthState {
  const token = getStoredToken();
  if (token) {
    const user = parseToken(token);
    if (user) {
      return { isAuthenticated: true, idToken: token, user };
    }
    // 期限切れ等で復元できないトークンはここで破棄しておくと
    // 次回以降のガードがログインループに陥らない。
    removeStoredToken();
  }
  return UNAUTHENTICATED;
}

// raw な id_token 文字列を localStorage に保存するためのカスタムストレージ。
// jotai/utils 既定の createJSONStorage は値を JSON エンコードするため、
// 既存レイアウト（プレーン文字列の id_token）との互換が崩れてしまう。
// subscribe で `storage` イベントを購読し、他タブからの変更を atom に伝搬する。
const idTokenStorage: IdTokenStorage = {
  getItem(key, initialValue) {
    if (typeof window === "undefined") return initialValue;
    return localStorage.getItem(key);
  },
  setItem(key, newValue) {
    if (typeof window === "undefined") return;
    if (newValue === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, newValue);
    }
  },
  removeItem(key) {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
  },
  subscribe(key, callback, _initialValue) {
    if (typeof window === "undefined") return undefined;
    const handler = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return;
      // localStorage.clear() の場合は key=null で発火するため、それも未認証扱い。
      if (e.key === null || e.key === key) {
        callback(e.newValue);
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  },
};

// 真実源としての id_token atom（モジュール外には公開しない）。
// getOnInit:true でモジュール load 時に同期的に localStorage を読み取り、
// 初期化フェーズで `getInitialState` の挙動と整合させる。
const idTokenAtom = atomWithStorage<string | null>(
  ID_TOKEN_KEY,
  null,
  idTokenStorage,
  { getOnInit: true },
);

// authAtom は idTokenAtom から派生する読み取り専用 atom。
// localStorage との二重管理を構造的に排除し、storage イベントを介して
// 他タブの変更にも追従する。
export const authAtom: Atom<AuthState> = atom((get) =>
  deriveAuthState(get(idTokenAtom)),
);

export const loginAtom = atom(null, (_get, set, token: string) => {
  set(idTokenAtom, token);
});

export const logoutAtom = atom(null, (_get, set) => {
  set(idTokenAtom, null);
  // 「前のユーザーが選択していた組織」が次のユーザーに引き継がれる事故を
  // 防ぐため、id_token と同じタイミングで current_organization_id も破棄する。
  set(clearCurrentOrganizationIdAtom);
});

export function getIdToken(): string | null {
  const token = getStoredToken();
  if (!token) return null;
  // authAtom は parseToken 検証後の値しか返さないため、getIdToken も
  // 期限切れトークンを返さないように揃える（読み取り結果の整合性を保つ）。
  if (!parseToken(token)) {
    removeStoredToken();
    return null;
  }
  return token;
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
