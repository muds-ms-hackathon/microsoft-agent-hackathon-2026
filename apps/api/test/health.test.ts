import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("GET /health", () => {
  it("200 と { status: 'ok' } を返す", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});

describe("未定義のパス", () => {
  it("404 を返す", async () => {
    const res = await app.request("/undefined-path");
    expect(res.status).toBe(404);
  });
});
