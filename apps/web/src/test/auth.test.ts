import { createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authAtom,
  getIdToken,
  getInitialState,
  getTokenNonce,
  loginAtom,
  logoutAtom,
  parseToken,
  saveExpectedAuthParams,
  verifyAndConsumeAuthParams,
} from "../lib/auth";
import { makeFakeIdToken } from "./helpers/auth";

// 他タブからの localStorage 変更を擬似的に再現するヘルパー。
// 同一 window 内の localStorage.setItem では storage イベントは発火しないため、
// dispatchEvent で別タブからの通知を模す。
function dispatchStorageEvent(key: string | null, newValue: string | null) {
  window.dispatchEvent(
    new StorageEvent("storage", {
      key,
      newValue,
      storageArea: localStorage,
    }),
  );
}

describe("parseToken", () => {
  it("Base64URL エンコードされた多バイト文字ペイロードを復元できる", () => {
    // 多バイト文字（日本語・絵文字）はエンコード結果に Base64URL 固有の `-` / `_`
    // を含みやすいため、`atob` 単体では復元できないケースの代表として用いる。
    const token = makeFakeIdToken({
      sub: "u1",
      email: "yamada@example.com",
      name: "山田太郎🚀",
    });

    const user = parseToken(token);

    expect(user).toEqual({
      sub: "u1",
      email: "yamada@example.com",
      name: "山田太郎🚀",
    });
  });

  it("不正な形式のトークンは null を返す", () => {
    expect(parseToken("not-a-jwt")).toBeNull();
  });

  it("exp が現在時刻より過去のトークンは null を返す（期限切れ）", () => {
    const expiredToken = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
      exp: Math.floor(Date.now() / 1000) - 60,
    });

    expect(parseToken(expiredToken)).toBeNull();
  });

  it("exp が未来のトークンはユーザー情報を返す", () => {
    const validToken = makeFakeIdToken({
      sub: "u2",
      email: "u2@example.com",
      name: "u2",
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    expect(parseToken(validToken)).toEqual({
      sub: "u2",
      email: "u2@example.com",
      name: "u2",
    });
  });

  it("email がなく preferred_username がある場合は preferred_username を email として返す（Entra External ID 対応）", () => {
    // Entra External ID は email クレームを省略し preferred_username に格納することがある。
    // JSON.stringify は undefined を省略するため、email キー自体がペイロードから除外される。
    const token = makeFakeIdToken({
      sub: "u3",
      email: undefined as unknown as string,
      preferred_username: "u3-pref@example.com",
      name: "u3",
    });

    expect(parseToken(token)).toEqual({
      sub: "u3",
      email: "u3-pref@example.com",
      name: "u3",
    });
  });

  it("email も preferred_username もない場合は null を返す", () => {
    const token = makeFakeIdToken({
      sub: "u4",
      email: undefined as unknown as string,
      name: "u4",
    });

    expect(parseToken(token)).toBeNull();
  });
});

describe("getInitialState", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("有効なトークンが localStorage にある場合、認証済み状態を返す", () => {
    const valid = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
    });
    localStorage.setItem("id_token", valid);

    const state = getInitialState();

    expect(state.isAuthenticated).toBe(true);
    expect(state.idToken).toBe(valid);
    expect(state.user).toEqual({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
    });
  });

  it("期限切れトークンが localStorage にある場合、未認証状態を返し localStorage をクリアする", () => {
    const expired = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    localStorage.setItem("id_token", expired);

    const state = getInitialState();

    expect(state.isAuthenticated).toBe(false);
    expect(state.idToken).toBeNull();
    expect(state.user).toBeNull();
    expect(localStorage.getItem("id_token")).toBeNull();
  });

  it("トークンが無い場合、未認証状態を返す", () => {
    const state = getInitialState();

    expect(state.isAuthenticated).toBe(false);
    expect(state.idToken).toBeNull();
    expect(state.user).toBeNull();
  });
});

describe("getTokenNonce", () => {
  it("ペイロード内の nonce を返す", () => {
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
      nonce: "n-abc",
    });

    expect(getTokenNonce(token)).toBe("n-abc");
  });

  it("nonce が無いトークンは null を返す", () => {
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
    });

    expect(getTokenNonce(token)).toBeNull();
  });

  it("不正な形式は null を返す", () => {
    expect(getTokenNonce("not-a-jwt")).toBeNull();
  });
});

describe("authAtom（localStorage 真実源・派生 atom）", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("loginAtom 経由で書き込むと localStorage と authAtom の双方が更新される", () => {
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
    });
    const store = createStore();

    store.set(loginAtom, token);

    expect(localStorage.getItem("id_token")).toBe(token);
    expect(store.get(authAtom)).toEqual({
      isAuthenticated: true,
      idToken: token,
      user: { sub: "u1", email: "u1@example.com", name: "u1" },
    });
  });

  it("logoutAtom 経由で書き込むと localStorage と authAtom の双方が未認証に揃う", () => {
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
    });
    const store = createStore();
    store.set(loginAtom, token);

    store.set(logoutAtom);

    expect(localStorage.getItem("id_token")).toBeNull();
    expect(store.get(authAtom)).toEqual({
      isAuthenticated: false,
      idToken: null,
      user: null,
    });
  });

  it("logoutAtom 経由で書き込むと currentOrganizationId もクリアされる", async () => {
    // logout 時に「前回のユーザーの選択中組織」が次のユーザーに引き継がれて
    // しまう事故を防ぐため、id_token と同時に current_organization_id も
    // クリアされることを確認する。
    const { setCurrentOrganizationIdAtom, currentOrganizationIdAtom } =
      await import("../lib/currentOrganization");
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
    });
    const store = createStore();
    store.set(loginAtom, token);
    store.set(setCurrentOrganizationIdAtom, "org-1");

    store.set(logoutAtom);

    expect(localStorage.getItem("current_organization_id")).toBeNull();
    expect(store.get(currentOrganizationIdAtom)).toBeNull();
  });

  it("他タブの logout（storage イベント newValue=null）で authAtom が未認証に追従する", () => {
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
    });
    const store = createStore();
    store.set(loginAtom, token);
    // atomWithStorage の subscribe は購読者がいる時のみ有効化されるため、
    // テストでも store.sub で明示的にサブスクライブする。
    const unsubscribe = store.sub(authAtom, () => {});

    try {
      dispatchStorageEvent("id_token", null);
      expect(store.get(authAtom)).toEqual({
        isAuthenticated: false,
        idToken: null,
        user: null,
      });
    } finally {
      unsubscribe();
    }
  });

  it("他タブの login（storage イベント newValue=有効トークン）で authAtom が認証済みに追従する", () => {
    const store = createStore();
    const unsubscribe = store.sub(authAtom, () => {});

    try {
      const token = makeFakeIdToken({
        sub: "u2",
        email: "u2@example.com",
        name: "u2",
      });
      // 他タブが localStorage に書き込んだのを模す。同タブの localStorage は
      // 既に書かれた前提で、storage イベントだけ発火させる。
      localStorage.setItem("id_token", token);
      dispatchStorageEvent("id_token", token);

      expect(store.get(authAtom)).toEqual({
        isAuthenticated: true,
        idToken: token,
        user: { sub: "u2", email: "u2@example.com", name: "u2" },
      });
    } finally {
      unsubscribe();
    }
  });

  it("storage イベントが期限切れトークンを通知しても authAtom は未認証のままになる", () => {
    const store = createStore();
    const unsubscribe = store.sub(authAtom, () => {});

    try {
      const expired = makeFakeIdToken({
        sub: "u1",
        email: "u1@example.com",
        name: "u1",
        exp: Math.floor(Date.now() / 1000) - 60,
      });
      localStorage.setItem("id_token", expired);
      dispatchStorageEvent("id_token", expired);

      expect(store.get(authAtom)).toEqual({
        isAuthenticated: false,
        idToken: null,
        user: null,
      });
    } finally {
      unsubscribe();
    }
  });

  it("localStorage.clear() 相当の storage イベント（key=null）でも authAtom がクリアされる", () => {
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
    });
    const store = createStore();
    store.set(loginAtom, token);
    const unsubscribe = store.sub(authAtom, () => {});

    try {
      dispatchStorageEvent(null, null);
      expect(store.get(authAtom)).toEqual({
        isAuthenticated: false,
        idToken: null,
        user: null,
      });
    } finally {
      unsubscribe();
    }
  });

  it("getIdToken と authAtom.idToken が同じ値を返す（整合性）", () => {
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
    });
    const store = createStore();

    store.set(loginAtom, token);
    expect(getIdToken()).toBe(token);
    expect(store.get(authAtom).idToken).toBe(token);

    store.set(logoutAtom);
    expect(getIdToken()).toBeNull();
    expect(store.get(authAtom).idToken).toBeNull();
  });
});

describe("getIdToken", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("有効なトークンが localStorage にある場合はそのトークンを返す", () => {
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
    });
    localStorage.setItem("id_token", token);

    expect(getIdToken()).toBe(token);
  });

  it("期限切れトークンは null を返し、localStorage からも除去する", () => {
    const expired = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    localStorage.setItem("id_token", expired);

    expect(getIdToken()).toBeNull();
    expect(localStorage.getItem("id_token")).toBeNull();
  });

  it("トークン未保存時は null を返す", () => {
    expect(getIdToken()).toBeNull();
  });
});

describe("verifyAndConsumeAuthParams", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("期待値が sessionStorage に無い場合は no_expected_params を返す", () => {
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
      nonce: "n-1",
    });

    const result = verifyAndConsumeAuthParams("s-1", token);

    expect(result).toEqual({ ok: false, reason: "no_expected_params" });
  });

  it("state 不一致では state_mismatch を返し、sessionStorage を消費する", () => {
    saveExpectedAuthParams("s-expected", "n-expected");
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
      nonce: "n-expected",
    });

    const result = verifyAndConsumeAuthParams("s-different", token);

    expect(result).toEqual({ ok: false, reason: "state_mismatch" });
    expect(sessionStorage.getItem("expected_state")).toBeNull();
    expect(sessionStorage.getItem("expected_nonce")).toBeNull();
  });

  it("nonce 不一致では nonce_mismatch を返す", () => {
    saveExpectedAuthParams("s-expected", "n-expected");
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
      nonce: "n-different",
    });

    const result = verifyAndConsumeAuthParams("s-expected", token);

    expect(result).toEqual({ ok: false, reason: "nonce_mismatch" });
  });

  it("state と nonce が一致すれば ok: true を返し、期待値は消費される", () => {
    saveExpectedAuthParams("s-expected", "n-expected");
    const token = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
      nonce: "n-expected",
    });

    const result = verifyAndConsumeAuthParams("s-expected", token);

    expect(result).toEqual({ ok: true });
    expect(sessionStorage.getItem("expected_state")).toBeNull();
    expect(sessionStorage.getItem("expected_nonce")).toBeNull();
  });
});
