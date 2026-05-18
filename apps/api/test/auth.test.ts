import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

// jose / prisma / oidc を全てモックしてミドルウェアロジックのみを検証する
vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
}));

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../src/lib/oidc.js", () => ({
  getIssuerUrl: () => "http://issuer.test",
  getAudience: () => "test-aud",
  getJwks: () => "fake-jwks",
}));

import { Prisma } from "@prisma/client";
import { jwtVerify } from "jose";
import { prisma } from "../src/lib/prisma.js";
import { auth } from "../src/middleware/auth.js";

const mockJwtVerify = vi.mocked(jwtVerify);
const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockCreate = vi.mocked(prisma.user.create);
const mockUpdate = vi.mocked(prisma.user.update);

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
    expect(mockFindUnique).not.toHaveBeenCalled();
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
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("jwtVerify には issuer / audience が渡される", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: "ext-1", email: "alice@example.com", name: "alice" },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockFindUnique.mockResolvedValueOnce(sampleUser);
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
    expect(mockFindUnique).not.toHaveBeenCalled();
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
    expect(mockFindUnique).not.toHaveBeenCalled();
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
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("既存ユーザーで email/name が一致する場合は update を発行しない", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: "ext-1", email: "alice@example.com", name: "alice" },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockFindUnique.mockResolvedValueOnce(sampleUser);
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; externalId: string };
    expect(body).toEqual({ id: "cuid-user-1", externalId: "ext-1" });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("未登録ユーザーは externalId/email/name/displayName=name で create される", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: "ext-2", email: "bob@example.com", name: "bob" },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({
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
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        externalId: "ext-2",
        email: "bob@example.com",
        name: "bob",
        displayName: "bob",
      },
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("既存ユーザーは IdP 側で email が変更された場合 update が発行される", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: {
        sub: "ext-1",
        email: "alice-renamed@example.com",
        name: "alice",
      },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockFindUnique.mockResolvedValueOnce(sampleUser);
    mockUpdate.mockResolvedValueOnce({
      ...sampleUser,
      email: "alice-renamed@example.com",
    });
    const app = buildTestApp();
    await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { externalId: "ext-1" },
      data: { email: "alice-renamed@example.com", name: "alice" },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("既存ユーザーは IdP 側で name が変更された場合 update が発行される", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: {
        sub: "ext-1",
        email: "alice@example.com",
        name: "alice-renamed",
      },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockFindUnique.mockResolvedValueOnce(sampleUser);
    mockUpdate.mockResolvedValueOnce({
      ...sampleUser,
      name: "alice-renamed",
    });
    const app = buildTestApp();
    await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { externalId: "ext-1" },
      data: { email: "alice@example.com", name: "alice-renamed" },
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("新規ユーザー作成時 email は trim + 小文字化された値で保存される", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: {
        sub: "ext-5",
        email: "  Bob@Example.COM  ",
        name: "bob",
      },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({
      ...sampleUser,
      id: "cuid-user-5",
      externalId: "ext-5",
      email: "bob@example.com",
      name: "bob",
      displayName: "bob",
    });
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        externalId: "ext-5",
        email: "bob@example.com",
        name: "bob",
        displayName: "bob",
      },
    });
  });

  it("既存ユーザーは payload email の大文字小文字差では update されない（正規化後一致）", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: {
        sub: "ext-1",
        email: "Alice@Example.COM",
        name: "alice",
      },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockFindUnique.mockResolvedValueOnce(sampleUser);
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("既存ユーザーの IdP 側 email 変更時は正規化済みの値で update される", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: {
        sub: "ext-1",
        email: "  Alice-Renamed@Example.COM  ",
        name: "alice",
      },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockFindUnique.mockResolvedValueOnce(sampleUser);
    mockUpdate.mockResolvedValueOnce({
      ...sampleUser,
      email: "alice-renamed@example.com",
    });
    const app = buildTestApp();
    await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { externalId: "ext-1" },
      data: { email: "alice-renamed@example.com", name: "alice" },
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
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("create 時に email が他ユーザーで使用済み (P2002) の場合は 409 を返す", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: "ext-3", email: "alice@example.com", name: "carol" },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`email`)",
        { code: "P2002", clientVersion: "test" },
      ),
    );
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("メールアドレス");
  });

  it("update 時に email が他ユーザーで使用済み (P2002) の場合は 409 を返す", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: {
        sub: "ext-1",
        email: "carol@example.com",
        name: "alice",
      },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockFindUnique.mockResolvedValueOnce(sampleUser);
    mockUpdate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`email`)",
        { code: "P2002", clientVersion: "test" },
      ),
    );
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(409);
  });

  it("P2002 以外の Prisma 既知エラーは握り潰さず例外として伝播する", async () => {
    mockJwtVerify.mockResolvedValueOnce({
      payload: { sub: "ext-4", email: "dave@example.com", name: "dave" },
      protectedHeader: { alg: "RS256" },
    } as never);
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("connection lost", {
        code: "P1017",
        clientVersion: "test",
      }),
    );
    const app = buildTestApp();
    const res = await app.request("/whoami", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(500);
  });
});
