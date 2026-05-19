import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireEnv } from "../src/lib/env.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_KEY = "MY_TEST_KEY";

afterEach(() => {
  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
  delete process.env[ORIGINAL_KEY];
});

describe("requireEnv", () => {
  beforeEach(() => {
    delete process.env[ORIGINAL_KEY];
  });

  it("env が設定されていれば その値を返す（NODE_ENV に依らない）", () => {
    process.env.NODE_ENV = "production";
    process.env[ORIGINAL_KEY] = "actual-value";
    expect(requireEnv(ORIGINAL_KEY, "dev-fallback")).toBe("actual-value");
  });

  it("env が未設定で NODE_ENV=production の場合は throw する", () => {
    process.env.NODE_ENV = "production";
    expect(() => requireEnv(ORIGINAL_KEY, "dev-fallback")).toThrowError(
      /MY_TEST_KEY/,
    );
  });

  it("env が空文字で NODE_ENV=production の場合も throw する", () => {
    process.env.NODE_ENV = "production";
    process.env[ORIGINAL_KEY] = "";
    expect(() => requireEnv(ORIGINAL_KEY, "dev-fallback")).toThrowError(
      /MY_TEST_KEY/,
    );
  });

  it("env が未設定で NODE_ENV=development の場合は devFallback を返す", () => {
    process.env.NODE_ENV = "development";
    expect(requireEnv(ORIGINAL_KEY, "dev-fallback")).toBe("dev-fallback");
  });

  it("env が未設定で NODE_ENV=test の場合も devFallback を返す（prod 分岐に入らない）", () => {
    process.env.NODE_ENV = "test";
    expect(requireEnv(ORIGINAL_KEY, "dev-fallback")).toBe("dev-fallback");
  });

  it("env が未設定で NODE_ENV が undefined の場合は devFallback を返す", () => {
    delete process.env.NODE_ENV;
    expect(requireEnv(ORIGINAL_KEY, "dev-fallback")).toBe("dev-fallback");
  });
});
