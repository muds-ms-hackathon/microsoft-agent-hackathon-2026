import { describe, expect, expectTypeOf, it } from "vitest";
import { api } from "../lib/api";

// hono/client は Proxy オブジェクトを返すため、存在しないプロパティも toBeDefined() を通過する。
// ルートの存在保証はコンパイル時の型チェック（expectTypeOf）に委ねる。
describe("api クライアント", () => {
  it("api がエクスポートされている", () => {
    expect(api).toBeDefined();
  });

  it("meetings・health ルートが AppType に型付けされている", () => {
    expectTypeOf(api.meetings).not.toBeNever();
    expectTypeOf(api.health).not.toBeNever();
  });
});
