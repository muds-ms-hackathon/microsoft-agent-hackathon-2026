import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    organizationMembership: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../src/lib/prisma.js";
import {
  requireOrgMembership,
  requireOrgRole,
} from "../src/middleware/authz.js";

const mockFindUnique = vi.mocked(prisma.organizationMembership.findUnique);

// テスト用のユーザーを c.var.user にセットしてくれる小さいラッパー
function buildContextApp(handler: (c: import("hono").Context) => Promise<Response>) {
  const app = new Hono();
  app.get("/probe/:orgId", async (c) => {
    c.set("user", {
      id: "user-1",
      externalId: "ext-1",
      email: "alice@example.com",
      name: "alice",
      displayName: "alice",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return handler(c);
  });
  return app;
}

describe("requireOrgMembership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("メンバーシップが存在すれば ok:true と membership を返す", async () => {
    const sampleMembership = {
      userId: "user-1",
      organizationId: "org-1",
      role: "member" as const,
      joinedAt: new Date("2026-05-01T00:00:00Z"),
    };
    mockFindUnique.mockResolvedValueOnce(sampleMembership);

    const app = buildContextApp(async (c) => {
      const guard = await requireOrgMembership(c, "org-1");
      if (!guard.ok) return guard.res;
      return c.json({ role: guard.membership.role });
    });

    const res = await app.request("/probe/org-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { role: string };
    expect(body.role).toBe("member");
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: { userId: "user-1", organizationId: "org-1" },
      },
    });
  });

  it("メンバーシップが存在しなければ 404 を返す", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const app = buildContextApp(async (c) => {
      const guard = await requireOrgMembership(c, "org-1");
      if (!guard.ok) return guard.res;
      return c.json({ role: guard.membership.role });
    });

    const res = await app.request("/probe/org-1");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("組織が見つかりません");
  });
});

describe("requireOrgRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("許可ロールに含まれていれば ok:true を返す", async () => {
    mockFindUnique.mockResolvedValueOnce({
      userId: "user-1",
      organizationId: "org-1",
      role: "owner",
      joinedAt: new Date(),
    });

    const app = buildContextApp(async (c) => {
      const guard = await requireOrgRole(
        c,
        "org-1",
        ["owner", "admin"],
        "権限がありません",
      );
      if (!guard.ok) return guard.res;
      return c.json({ role: guard.membership.role });
    });

    const res = await app.request("/probe/org-1");
    expect(res.status).toBe(200);
  });

  it("メンバーシップが無い場合は 404 を返す（ロール判定より優先）", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const app = buildContextApp(async (c) => {
      const guard = await requireOrgRole(
        c,
        "org-1",
        ["owner"],
        "権限がありません",
      );
      if (!guard.ok) return guard.res;
      return c.json({ ok: true });
    });

    const res = await app.request("/probe/org-1");
    expect(res.status).toBe(404);
  });

  it("メンバーだがロール不足の場合は 403 と指定の forbiddenMessage を返す", async () => {
    mockFindUnique.mockResolvedValueOnce({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date(),
    });

    const app = buildContextApp(async (c) => {
      const guard = await requireOrgRole(
        c,
        "org-1",
        ["owner", "admin"],
        "管理者のみ実行できます",
      );
      if (!guard.ok) return guard.res;
      return c.json({ ok: true });
    });

    const res = await app.request("/probe/org-1");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("管理者のみ実行できます");
  });
});
