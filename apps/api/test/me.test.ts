import { beforeEach, describe, expect, it, vi } from "vitest";

// Prisma を全モックしてルートロジックのみ検証する。
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    organizationInvitation: {
      findMany: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
  },
}));

// auth ミドルウェアを差し替え、認証済みユーザーを c.var.user に注入する。
// テストごとに email を上書きできるよう mutable な hoisted state を介す。
const authState = vi.hoisted(() => {
  const defaultUser = {
    id: "user-1",
    externalId: "ext-1",
    email: "alice@example.com",
    name: "alice",
    displayName: "alice",
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
  };
  return {
    defaultUser,
    current: { ...defaultUser },
  };
});

vi.mock("../src/middleware/auth.js", () => ({
  auth: async (
    c: { set: (key: string, value: unknown) => void },
    next: () => Promise<void>,
  ) => {
    c.set("user", authState.current);
    await next();
  },
}));

import type { Prisma } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const mockInvitationFindMany = vi.mocked(
  prisma.organizationInvitation.findMany,
);
const mockUserUpdate = vi.mocked(prisma.user.update);

// GET /me/invitations ハンドラの include 形に対応する型エイリアス。
type InvitationListRow = Prisma.OrganizationInvitationGetPayload<{
  include: {
    organization: { select: { id: true; name: true } };
    inviter: {
      select: { id: true; name: true; displayName: true; email: true };
    };
  };
}>;

function buildInvitation(
  overrides: Partial<InvitationListRow> = {},
): InvitationListRow {
  return {
    id: "inv-1",
    organizationId: "org-1",
    email: "alice@example.com",
    invitedBy: "user-2",
    role: "member" as const,
    expiresAt: new Date("2099-01-01T00:00:00Z"),
    status: "pending" as const,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    organization: { id: "org-1", name: "ACME 株式会社" },
    inviter: {
      id: "user-2",
      name: "bob",
      displayName: "Bob",
      email: "bob@example.com",
    },
    ...overrides,
  };
}

describe("GET /me/invitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.current = { ...authState.defaultUser };
  });

  it("認証ユーザーの email に一致する pending 非期限切れの招待を返す", async () => {
    const inv = buildInvitation();
    mockInvitationFindMany.mockResolvedValue([inv]);

    const res = await app.request("/me/invitations");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      id: string;
      organization: { id: string; name: string };
      role: string;
      inviter: { name: string; email: string };
      expiresAt: string;
    }>;
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("inv-1");
    expect(body[0].organization).toEqual({
      id: "org-1",
      name: "ACME 株式会社",
    });
    expect(body[0].role).toBe("member");
    expect(body[0].inviter.name).toBe("bob");
    expect(body[0].inviter.email).toBe("bob@example.com");
  });

  it("認証ユーザーの email・pending・期限内で findMany が呼ばれる", async () => {
    mockInvitationFindMany.mockResolvedValue([]);

    await app.request("/me/invitations");
    expect(mockInvitationFindMany).toHaveBeenCalledTimes(1);
    const callArg = mockInvitationFindMany.mock.calls[0]?.[0];
    expect(callArg?.where).toMatchObject({
      email: "alice@example.com",
      status: "pending",
    });
    // 期限切れ除外: expiresAt > 現在時刻
    expect(callArg?.where?.expiresAt).toBeDefined();
    expect(callArg?.where?.expiresAt.gt).toBeInstanceOf(Date);
  });

  it("該当する招待が無い場合は空配列を返す", async () => {
    mockInvitationFindMany.mockResolvedValue([]);

    const res = await app.request("/me/invitations");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("organization と inviter を include して返す", async () => {
    mockInvitationFindMany.mockResolvedValue([]);

    await app.request("/me/invitations");
    const callArg = mockInvitationFindMany.mock.calls[0]?.[0];
    expect(callArg?.include).toBeDefined();
    expect(callArg?.include?.organization).toBeTruthy();
    expect(callArg?.include?.inviter).toBeTruthy();
  });

  it("複数件は createdAt 降順で返す（新しい招待を上に）", async () => {
    mockInvitationFindMany.mockResolvedValue([]);

    await app.request("/me/invitations");
    const callArg = mockInvitationFindMany.mock.calls[0]?.[0];
    expect(callArg?.orderBy).toEqual({ createdAt: "desc" });
  });
});

describe("GET /me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.current = { ...authState.defaultUser };
  });

  it("認証ユーザー自身のプロフィールを返す", async () => {
    const res = await app.request("/me");
    expect(res.status).toBe(200);
    const body = await res.json();
    // c.var.user の表示用フィールドのみを返す（externalId 等は含めない）。
    expect(body).toEqual({
      id: "user-1",
      email: "alice@example.com",
      name: "alice",
      displayName: "alice",
    });
  });
});

describe("PATCH /me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.current = { ...authState.defaultUser };
  });

  it("displayName を更新して更新後のプロフィールを返す", async () => {
    mockUserUpdate.mockResolvedValue({
      id: "user-1",
      email: "alice@example.com",
      name: "alice",
      displayName: "新しい表示名",
    } as Awaited<ReturnType<typeof prisma.user.update>>);

    const res = await app.request("/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "新しい表示名" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      id: "user-1",
      email: "alice@example.com",
      name: "alice",
      displayName: "新しい表示名",
    });
    // 自分自身 (user.id) のみを更新する。
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { displayName: "新しい表示名" },
      select: { id: true, email: true, name: true, displayName: true },
    });
  });

  it("displayName が空文字なら 400 を返し更新しない", async () => {
    const res = await app.request("/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "" }),
    });

    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("displayName が 50 文字を超えると 400 を返し更新しない", async () => {
    const res = await app.request("/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "あ".repeat(51) }),
    });

    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
