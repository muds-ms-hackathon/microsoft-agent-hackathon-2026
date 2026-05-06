import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// jose / prisma / oidc を全てモックしてミドルウェアロジックのみを検証する
vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("../src/lib/oidc.js", () => ({
  getIssuerUrl: () => "http://issuer.test",
  getAudience: () => "test-aud",
  getJwks: () => "fake-jwks",
}));

import { jwtVerify } from "jose";
import { prisma } from "../src/lib/prisma.js";
import { auth } from "../src/middleware/auth.js";

const mockJwtVerify = vi.mocked(jwtVerify);
const mockUpsert = vi.mocked(prisma.user.upsert);

const sampleUser = {
  id: "cuid-user-1",
  externalId: "ext-1",
  email: "alice@example.com",
  name: "alice",
  displayName: "alice",
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-01T00:00:00Z"),
};

// auth ミドルウェアを適用したテスト用アプリ
function buildTestApp() {
  const app = new Hono();
  app.use("/whoami", auth);
  app.get("/whoami", (c) => {
    const user = c.var.user;
    return c.json({ id: user.id, externalId: user.externalId });
  });
  return app;
}

describe("auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Authorization ヘッダ無しの場合は 401 を返す", async () => {
    const app = buildTestApp();
    const res = await app.request("/whoami");
    expect(res.status).toBe(401);
    expect(mockJwtVerify).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("Bearer プレフィックスが無い場合は 401 を返す", async () => {
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status).toBe(401);
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("jwtVerify が失敗した場合は 401 を返す", async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error("signature mismatch"));
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("jwtVerify には issuer / audience が渡される", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: "ext-1", email: "alice@example.com", name: "alice" },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockUpsert.mockResolvedValueOnce(sampleUser);
    const app = buildTestApp();
    await app.request("/whoami", {
      headers: { Authorization: "Bearer good-token" },
    });
    expect(mockJwtVerify).toHaveBeenCalledWith("good-token", "fake-jwks", {
      issuer: "http://issuer.test",
      audience: "test-aud",
    });
  });

  it("payload.sub が無い場合は 401 を返す", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { email: "alice@example.com", name: "alice" },
      protectedHeader: { alg: "RS256" },
    } as never);
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("payload.email が無い場合は 401 を返す", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: "ext-1", name: "alice" },
      protectedHeader: { alg: "RS256" },
    } as never);
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("payload.name が無い場合は 401 を返す", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: "ext-1", email: "alice@example.com" },
      protectedHeader: { alg: "RS256" },
    } as never);
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("既存ユーザーがいる場合はそのユーザーを c.var.user にセットする", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: "ext-1", email: "alice@example.com", name: "alice" },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockUpsert.mockResolvedValueOnce(sampleUser);
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; externalId: string };
    expect(body).toEqual({ id: "cuid-user-1", externalId: "ext-1" });
  });

  it("未登録ユーザーは externalId/email/name/displayName=name で upsert.create される", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: "ext-2", email: "bob@example.com", name: "bob" },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockUpsert.mockResolvedValueOnce({
      ...sampleUser,
      id: "cuid-user-2",
      externalId: "ext-2",
      email: "bob@example.com",
      name: "bob",
      displayName: "bob",
    });
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { externalId: "ext-2" },
      create: {
        externalId: "ext-2",
        email: "bob@example.com",
        name: "bob",
        displayName: "bob",
      },
      update: {},
    });
  });

  it("payload.sub が文字列以外の場合は 401 を返す", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: 123, email: "alice@example.com", name: "alice" },
      protectedHeader: { alg: "RS256" },
    } as never);
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
