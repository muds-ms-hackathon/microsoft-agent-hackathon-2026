import { describe, expect, it } from "vitest";
import { api } from "../lib/api";

describe("api クライアント", () => {
  it("api がエクスポートされている", () => {
    expect(api).toBeDefined();
  });

  it("meetings ルートクライアントが存在する", () => {
    expect(api.meetings).toBeDefined();
  });

  it("health ルートクライアントが存在する", () => {
    expect(api.health).toBeDefined();
  });
});
