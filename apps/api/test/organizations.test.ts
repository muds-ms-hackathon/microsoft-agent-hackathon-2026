import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Prisma を全モックしてルートロジックのみ検証する。
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    organization: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    organizationMembership: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    organizationInvitation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// auth ミドルウェアを差し替え、固定の認証済みユーザーを c.var.user に注入する。
vi.mock("../src/middleware/auth.js", () => ({
  auth: async (
    c: {
      set: (key: string, value: unknown) => void;
    },
    next: () => Promise<void>,
  ) => {
    c.set("user", {
      id: "user-1",
      externalId: "ext-1",
      email: "alice@example.com",
      name: "alice",
      displayName: "alice",
      createdAt: new Date("2026-05-01T00:00:00Z"),
      updatedAt: new Date("2026-05-01T00:00:00Z"),
    });
    await next();
  },
}));

import { Prisma } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const mockOrgFindMany = vi.mocked(prisma.organization.findMany);
const mockOrgFindUnique = vi.mocked(prisma.organization.findUnique);
const mockOrgUpdate = vi.mocked(prisma.organization.update);
const mockOrgDelete = vi.mocked(prisma.organization.delete);
const mockMembershipFindUnique = vi.mocked(
  prisma.organizationMembership.findUnique,
);
const mockInvitationCreate = vi.mocked(prisma.organizationInvitation.create);
const mockTransaction = vi.mocked(prisma.$transaction);

const sampleOrg = {
  id: "org-1",
  name: "ACME 株式会社",
  description: "テスト組織",
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-01T00:00:00Z"),
};

describe("POST /organizations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("201 と作成した組織を返し、作成者を owner として membership に登録する", async () => {
    // $transaction はコールバックに tx (= prisma) を渡して実行するモック実装にする
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        organization: { create: vi.fn().mockResolvedValue(sampleOrg) },
        organizationMembership: { create: vi.fn().mockResolvedValue({}) },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用のミニマルな tx スタブ
      const result = await (fn as (t: any) => Promise<unknown>)(tx);
      // 作成と membership 作成が tx 内で呼ばれたか確認
      expect(tx.organization.create).toHaveBeenCalledWith({
        data: { name: "ACME 株式会社", description: "テスト組織" },
      });
      expect(tx.organizationMembership.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          organizationId: "org-1",
          role: "owner",
        },
      });
      return result;
    });

    const res = await app.request("/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "ACME 株式会社",
        description: "テスト組織",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.id).toBe("org-1");
    expect(body.name).toBe("ACME 株式会社");
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("description は省略可能", async () => {
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        organization: {
          create: vi
            .fn()
            .mockResolvedValue({ ...sampleOrg, description: null }),
        },
        organizationMembership: { create: vi.fn().mockResolvedValue({}) },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用のミニマルな tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ACME 株式会社" }),
    });

    expect(res.status).toBe(201);
  });

  it("name が空の場合は 400 を返す", async () => {
    const res = await app.request("/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("body 不正 (name 欠落) の場合は 400 を返す", async () => {
    const res = await app.request("/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "no name" }),
    });
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe("GET /organizations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("200 と認証ユーザーが所属する組織一覧を返す", async () => {
    mockOrgFindMany.mockResolvedValue([sampleOrg]);
    const res = await app.request("/organizations");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string }>;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("org-1");
    expect(mockOrgFindMany).toHaveBeenCalledWith({
      where: { memberships: { some: { userId: "user-1" } } },
      orderBy: { createdAt: "desc" },
    });
  });

  it("所属組織が無い場合は空配列を返す", async () => {
    mockOrgFindMany.mockResolvedValue([]);
    const res = await app.request("/organizations");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

describe("GET /organizations/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("認証ユーザーが所属していれば 200 で組織を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date("2026-05-01T00:00:00Z"),
    });
    mockOrgFindUnique.mockResolvedValue(sampleOrg);

    const res = await app.request("/organizations/org-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe("org-1");

    expect(mockMembershipFindUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: { userId: "user-1", organizationId: "org-1" },
      },
    });
    expect(mockOrgFindUnique).toHaveBeenCalledWith({
      where: { id: "org-1" },
    });
  });

  it("認証ユーザーが所属していない場合は 404 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(null);

    const res = await app.request("/organizations/org-1");
    expect(res.status).toBe(404);
    expect(mockOrgFindUnique).not.toHaveBeenCalled();
  });

  it("組織が存在しない場合は 404 を返す", async () => {
    // 所属レコードはあるが Organization 本体が削除済み等のレースケース
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date("2026-05-01T00:00:00Z"),
    });
    mockOrgFindUnique.mockResolvedValue(null);

    const res = await app.request("/organizations/org-1");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /organizations/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  function membership(role: "owner" | "admin" | "member") {
    return {
      userId: "user-1",
      organizationId: "org-1",
      role,
      joinedAt: new Date("2026-05-01T00:00:00Z"),
    };
  }

  it("owner は 200 で更新できる", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("owner"));
    mockOrgUpdate.mockResolvedValue({ ...sampleOrg, name: "新しい名前" });

    const res = await app.request("/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "新しい名前" }),
    });
    expect(res.status).toBe(200);
    expect(mockOrgUpdate).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { name: "新しい名前" },
    });
  });

  it("admin は 200 で更新できる", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("admin"));
    mockOrgUpdate.mockResolvedValue({ ...sampleOrg, description: "新説明" });

    const res = await app.request("/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "新説明" }),
    });
    expect(res.status).toBe(200);
    expect(mockOrgUpdate).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { description: "新説明" },
    });
  });

  it("member は 403 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("member"));
    const res = await app.request("/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(403);
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it("未所属ユーザーは 404 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x" }),
    });
    expect(res.status).toBe(404);
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it("name が空文字列の場合は 400 を返す", async () => {
    const res = await app.request("/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it("name と description の両方を一度に更新できる", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("owner"));
    mockOrgUpdate.mockResolvedValue({
      ...sampleOrg,
      name: "n",
      description: "d",
    });
    const res = await app.request("/organizations/org-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "n", description: "d" }),
    });
    expect(res.status).toBe(200);
    expect(mockOrgUpdate).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { name: "n", description: "d" },
    });
  });
});

describe("DELETE /organizations/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  function membership(role: "owner" | "admin" | "member") {
    return {
      userId: "user-1",
      organizationId: "org-1",
      role,
      joinedAt: new Date("2026-05-01T00:00:00Z"),
    };
  }

  it("owner は 200 で削除できる", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("owner"));
    mockOrgDelete.mockResolvedValue(sampleOrg);

    const res = await app.request("/organizations/org-1", { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(mockOrgDelete).toHaveBeenCalledWith({ where: { id: "org-1" } });
  });

  it("admin は 403 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("admin"));
    const res = await app.request("/organizations/org-1", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(mockOrgDelete).not.toHaveBeenCalled();
  });

  it("member は 403 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("member"));
    const res = await app.request("/organizations/org-1", { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(mockOrgDelete).not.toHaveBeenCalled();
  });

  it("未所属ユーザーは 404 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/organizations/org-1", { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(mockOrgDelete).not.toHaveBeenCalled();
  });
});

describe("POST /organizations/:id/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // テスト全体で時刻を固定して expiresAt を検証可能にする
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function membership(role: "owner" | "admin" | "member") {
    return {
      userId: "user-1",
      organizationId: "org-1",
      role,
      joinedAt: new Date("2026-05-01T00:00:00Z"),
    };
  }

  const sampleInvitation = {
    id: "inv-1",
    organizationId: "org-1",
    email: "bob@example.com",
    invitedBy: "user-1",
    role: "member",
    expiresAt: new Date("2026-05-13T00:00:00Z"),
    status: "pending",
    createdAt: new Date("2026-05-06T00:00:00Z"),
  };

  it("owner は招待を作成でき、デフォルト role=member / 7日後 expiresAt が設定される", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("owner"));
    mockInvitationCreate.mockResolvedValue(sampleInvitation);

    const res = await app.request("/organizations/org-1/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com" }),
    });
    expect(res.status).toBe(201);
    expect(mockInvitationCreate).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        email: "bob@example.com",
        invitedBy: "user-1",
        role: "member",
        expiresAt: new Date("2026-05-13T00:00:00Z"),
      },
    });
  });

  it("admin は招待を作成でき、指定した role=admin が invitation に保存される", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("admin"));
    mockInvitationCreate.mockResolvedValue({ ...sampleInvitation, role: "admin" });

    const res = await app.request("/organizations/org-1/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "bob@example.com",
        role: "admin",
        expiresInDays: 14,
      }),
    });
    expect(res.status).toBe(201);
    expect(mockInvitationCreate).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        email: "bob@example.com",
        invitedBy: "user-1",
        role: "admin",
        expiresAt: new Date("2026-05-20T00:00:00Z"),
      },
    });
  });

  it("member は 403 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("member"));
    const res = await app.request("/organizations/org-1/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com" }),
    });
    expect(res.status).toBe(403);
    expect(mockInvitationCreate).not.toHaveBeenCalled();
  });

  it("未所属ユーザーは 404 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/organizations/org-1/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com" }),
    });
    expect(res.status).toBe(404);
    expect(mockInvitationCreate).not.toHaveBeenCalled();
  });

  it("email がメール形式でない場合は 400 を返す", async () => {
    const res = await app.request("/organizations/org-1/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "not-an-email" }),
    });
    expect(res.status).toBe(400);
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
  });

  it("role に owner を指定した場合は 400 を返す", async () => {
    const res = await app.request("/organizations/org-1/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com", role: "owner" }),
    });
    expect(res.status).toBe(400);
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
  });

  it("expiresInDays が 0 以下の場合は 400 を返す", async () => {
    const res = await app.request("/organizations/org-1/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com", expiresInDays: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it("P2002 以外の Prisma 既知エラーは握り潰さず 500 として伝播する", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("owner"));
    mockInvitationCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("connection lost", {
        code: "P1017",
        clientVersion: "test",
      }),
    );

    // Hono の既定動作で未捕捉例外は 500 になる
    const res = await app.request("/organizations/org-1/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com" }),
    });
    expect(res.status).toBe(500);
  });

  it("同一メール × 同一組織 × pending の招待が既存の場合 (P2002) は 409 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("owner"));
    mockInvitationCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const res = await app.request("/organizations/org-1/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@example.com" }),
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /organizations/:id/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const pendingInvitation = {
    id: "inv-1",
    organizationId: "org-1",
    email: "alice@example.com",
    invitedBy: "user-2",
    role: "member" as const,
    expiresAt: new Date("2026-05-13T00:00:00Z"),
    status: "pending",
    createdAt: new Date("2026-05-06T00:00:00Z"),
  };

  it("有効な招待がある場合 200 を返し、招待を accepted に更新し membership(member) を作成する", async () => {
    // 既に member として参加していないことを確認するための findUnique モック
    mockMembershipFindUnique.mockResolvedValue(null);

    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        organizationInvitation: {
          findFirst: vi.fn().mockResolvedValue(pendingInvitation),
          update: vi.fn().mockResolvedValue({
            ...pendingInvitation,
            status: "accepted",
          }),
        },
        organizationMembership: {
          create: vi.fn().mockResolvedValue({
            userId: "user-1",
            organizationId: "org-1",
            role: "member",
            joinedAt: new Date("2026-05-06T00:00:00Z"),
          }),
        },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用のミニマルな tx スタブ
      const result = await (fn as (t: any) => Promise<unknown>)(tx);

      expect(tx.organizationInvitation.findFirst).toHaveBeenCalledWith({
        where: {
          organizationId: "org-1",
          email: "alice@example.com",
          status: "pending",
          expiresAt: { gt: new Date("2026-05-06T00:00:00Z") },
        },
      });
      expect(tx.organizationInvitation.update).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { status: "accepted" },
      });
      expect(tx.organizationMembership.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          organizationId: "org-1",
          role: "member",
        },
      });
      return result;
    });

    const res = await app.request("/organizations/org-1/join", {
      method: "POST",
    });
    expect(res.status).toBe(200);
  });

  it("invitation.role が admin の場合は membership も admin として作成される", async () => {
    mockMembershipFindUnique.mockResolvedValue(null);

    const adminInvitation = { ...pendingInvitation, role: "admin" as const };
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        organizationInvitation: {
          findFirst: vi.fn().mockResolvedValue(adminInvitation),
          update: vi.fn().mockResolvedValue({
            ...adminInvitation,
            status: "accepted",
          }),
        },
        organizationMembership: {
          create: vi.fn().mockResolvedValue({
            userId: "user-1",
            organizationId: "org-1",
            role: "admin",
            joinedAt: new Date("2026-05-06T00:00:00Z"),
          }),
        },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用のミニマルな tx スタブ
      const result = await (fn as (t: any) => Promise<unknown>)(tx);

      expect(tx.organizationMembership.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          organizationId: "org-1",
          role: "admin",
        },
      });
      return result;
    });

    const res = await app.request("/organizations/org-1/join", {
      method: "POST",
    });
    expect(res.status).toBe(200);
  });

  it("認証ユーザー向けの pending 招待が存在しない場合は 404 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(null);
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        organizationInvitation: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
        },
        organizationMembership: { create: vi.fn() },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用のミニマルな tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/organizations/org-1/join", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("既に member として参加済みの場合は 409 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date("2026-05-01T00:00:00Z"),
    });

    const res = await app.request("/organizations/org-1/join", {
      method: "POST",
    });
    expect(res.status).toBe(409);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("並列 /join で membership 作成時に P2002 が発生した場合は 409 を返す", async () => {
    // 高速パスはすり抜けるが、別リクエストが先に membership を作成済みのケース
    mockMembershipFindUnique.mockResolvedValue(null);
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        organizationInvitation: {
          findFirst: vi.fn().mockResolvedValue(pendingInvitation),
          update: vi.fn().mockResolvedValue({
            ...pendingInvitation,
            status: "accepted",
          }),
        },
        organizationMembership: {
          create: vi.fn().mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError(
              "Unique constraint failed",
              { code: "P2002", clientVersion: "test" },
            ),
          ),
        },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用のミニマルな tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/organizations/org-1/join", {
      method: "POST",
    });
    expect(res.status).toBe(409);
  });

  it("P2002 以外の Prisma 既知エラーは 500 として伝播する", async () => {
    mockMembershipFindUnique.mockResolvedValue(null);
    mockTransaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("connection lost", {
        code: "P1017",
        clientVersion: "test",
      }),
    );

    const res = await app.request("/organizations/org-1/join", {
      method: "POST",
    });
    expect(res.status).toBe(500);
  });
});
