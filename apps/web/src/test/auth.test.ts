import { describe, expect, it } from "vitest";
import { parseToken } from "../lib/auth";
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
