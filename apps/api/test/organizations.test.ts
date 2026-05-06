import { beforeEach, describe, expect, it, vi } from "vitest";

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
const mockInvitationFindFirst = vi.mocked(
  prisma.organizationInvitation.findFirst,
);
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

// 後続テストで使用するモックを参照保持しておくためのダミー句（Biome の未使用警告回避）
void mockOrgFindMany;
void mockOrgFindUnique;
void mockOrgUpdate;
void mockOrgDelete;
void mockMembershipFindUnique;
void mockInvitationCreate;
void mockInvitationFindFirst;
