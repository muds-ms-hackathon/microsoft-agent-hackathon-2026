import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    organizationMembership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    decisionItem: {
      findUnique: vi.fn(),
    },
    decisionItemAssignee: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

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
  return { defaultUser, current: { ...defaultUser } };
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

import { Prisma } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

type DecisionItemWithAccess = Prisma.DecisionItemGetPayload<{
  include: {
    meeting: {
      select: { recurringMeeting: { select: { organizationId: true } } };
    };
  };
}>;

const mockMembershipFindUnique = vi.mocked(
  prisma.organizationMembership.findUnique,
);
const mockMembershipFindMany = vi.mocked(
  prisma.organizationMembership.findMany,
);
const mockDecisionItemFindUnique = vi.mocked(prisma.decisionItem.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

function membership(role: "owner" | "admin" | "member" = "member") {
  return {
    userId: "user-1",
    organizationId: "org-1",
    role,
    joinedAt: new Date("2026-05-01T00:00:00Z"),
  };
}

const sampleItem: DecisionItemWithAccess = {
  id: "di-1",
  meetingId: "mtg-1",
  title: "テスト決定事項",
  body: null,
  sourceQuote: null,
  sourceContext: null,
  status: "reviewing",
  decisionState: "confirmed",
  reason: null,
  blockingItemId: null,
  recurrenceCount: null,
  ambiguityFlags: null,
  decisionDeadline: null,
  plannedMeetingId: null,
  decidedAt: null,
  decidedBy: null,
  version: 0,
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-01T00:00:00Z"),
  meeting: { recurringMeeting: { organizationId: "org-1" } },
};

describe("PATCH /decision-items/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("アイテムが存在しない場合は 404", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(null);

    const res = await app.request("/decision-items/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, title: "更新" }),
    });

    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("組織非所属の場合は 404", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(null);

    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, title: "更新" }),
    });

    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("title 更新が 200 を返し version がインクリメントされる", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        decisionItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValue({ ...sampleItem, title: "更新後", version: 1, assignees: [] }),
        },
        decisionItemAssignee: { deleteMany: vi.fn(), createMany: vi.fn() },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, title: "更新後" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string; version: number };
    expect(body.title).toBe("更新後");
    expect(body.version).toBe(1);
  });

  it("version 不一致は 409", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        decisionItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUniqueOrThrow: vi.fn(),
        },
        decisionItemAssignee: { deleteMany: vi.fn(), createMany: vi.fn() },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 99, title: "更新後" }),
    });

    expect(res.status).toBe(409);
  });

  it("assigneeUserIds に他組織メンバーが混在する場合は 400", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    // 2 名指定したが 1 名しか組織メンバーとして見つからない
    mockMembershipFindMany.mockResolvedValue([membership()]);

    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 0,
        assigneeUserIds: ["user-1", "user-outside"],
      }),
    });

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("assigneeUserIds:[] は既存アサイニーを全削除する", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    // 空配列で findMany を呼ぶと 0 件返る（DB の実挙動と一致）
    mockMembershipFindMany.mockResolvedValue([]);
    let deleteCalled = false;
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        decisionItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValue({ ...sampleItem, assignees: [] }),
        },
        decisionItemAssignee: {
          deleteMany: vi.fn(() => {
            deleteCalled = true;
            return Promise.resolve({ count: 0 });
          }),
          createMany: vi.fn(),
        },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, assigneeUserIds: [] }),
    });

    expect(res.status).toBe(200);
    expect(deleteCalled).toBe(true);
  });

  it("更新フィールドなし（version のみ）は 400", async () => {
    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0 }),
    });

    expect(res.status).toBe(400);
    expect(mockDecisionItemFindUnique).not.toHaveBeenCalled();
  });

  it("version 欠落は 400", async () => {
    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新後" }),
    });

    expect(res.status).toBe(400);
  });

  it("スキーマ外フィールドは 400（strict）", async () => {
    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, title: "更新後", unknownField: "x" }),
    });

    expect(res.status).toBe(400);
  });
});
