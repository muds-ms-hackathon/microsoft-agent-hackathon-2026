import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getInitialState,
  getTokenNonce,
  parseToken,
  saveExpectedAuthParams,
  verifyAndConsumeAuthParams,
} from "../lib/auth";
import { makeFakeIdToken } from "./helpers/auth";

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
