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
});
