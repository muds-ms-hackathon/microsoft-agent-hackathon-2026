import { beforeEach, describe, expect, it, vi } from "vitest";

// Prisma を全モックして decision-items / meetings ルートのロジックのみを検証する。
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    organizationMembership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    meeting: {
      findUnique: vi.fn(),
    },
    decisionItem: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
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

import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const mockMembershipFindUnique = vi.mocked(
  prisma.organizationMembership.findUnique,
);
const mockMembershipFindMany = vi.mocked(
  prisma.organizationMembership.findMany,
);
const mockMeetingFindUnique = vi.mocked(prisma.meeting.findUnique);
const mockDecisionItemFindUnique = vi.mocked(prisma.decisionItem.findUnique);
const mockDecisionItemFindMany = vi.mocked(prisma.decisionItem.findMany);
const mockTransaction = vi.mocked(prisma.$transaction);

function membership(role: "owner" | "admin" | "member" = "member") {
  return {
    userId: "user-1",
    organizationId: "org-1",
    role,
    joinedAt: new Date("2026-05-01T00:00:00Z"),
  };
}

// requireMeetingAccess で返す meeting モック。
function mockMeeting() {
  return {
    id: "mtg-1",
    recurringMeetingId: "rmtg-1",
    recurringMeeting: { organizationId: "org-1" },
  };
}

// requireDecisionItemAccess で返す DecisionItem モック（select 形式）。
function mockDecisionItemRaw(overrides = {}) {
  return {
    id: "di-1",
    status: "open" as const,
    meetingId: "mtg-1",
    meeting: { recurringMeeting: { organizationId: "org-1" } },
    ...overrides,
  };
}

const sampleDecisionItem = {
  id: "di-1",
  meetingId: "mtg-1",
  title: "AI 導入を承認する",
  body: null,
  sourceQuote: null,
  sourceContext: null,
  status: "open" as const,
  decisionState: null,
  reason: null,
  blockingItemId: null,
  recurrenceCount: null,
  ambiguityFlags: null,
  decisionDeadline: null,
  plannedMeetingId: null,
  decidedAt: null,
  decidedBy: null,
  version: 0,
  createdAt: new Date("2026-05-17T00:00:00Z"),
  updatedAt: new Date("2026-05-17T00:00:00Z"),
  assignees: [],
  meeting: { recurringMeeting: { id: "rmtg-1", name: "週次定例" } },
};

// ──────────────────────────────────────────────
// GET /meetings/:id/decision-items
// ──────────────────────────────────────────────
describe("GET /meetings/:id/decision-items", () => {
  beforeEach(() => vi.clearAllMocks());

  it("組織メンバーは 200 でリストを取得できる", async () => {
    mockMeetingFindUnique.mockResolvedValue(mockMeeting() as never);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockDecisionItemFindMany.mockResolvedValue([sampleDecisionItem] as never);

    const res = await app.request("/meetings/mtg-1/decision-items");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("di-1");
  });

  it("status フィルタで絞り込める", async () => {
    mockMeetingFindUnique.mockResolvedValue(mockMeeting() as never);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockDecisionItemFindMany.mockResolvedValue([] as never);

    const res = await app.request(
      "/meetings/mtg-1/decision-items?status=decided",
    );
    expect(res.status).toBe(200);
    expect(mockDecisionItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["decided"] },
          meetingId: "mtg-1",
        }),
      }),
    );
  });

  it("不正な status 値は 400", async () => {
    const res = await app.request(
      "/meetings/mtg-1/decision-items?status=invalid",
    );
    expect(res.status).toBe(400);
  });

  it("会議が存在しない場合は 404", async () => {
    mockMeetingFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/missing/decision-items");
    expect(res.status).toBe(404);
  });

  it("組織非所属は 404", async () => {
    mockMeetingFindUnique.mockResolvedValue(mockMeeting() as never);
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/mtg-1/decision-items");
    expect(res.status).toBe(404);
  });

  it("担当者の user 情報が平坦化される", async () => {
    mockMeetingFindUnique.mockResolvedValue(mockMeeting() as never);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockDecisionItemFindMany.mockResolvedValue([
      {
        ...sampleDecisionItem,
        assignees: [
          {
            user: { id: "user-1", name: "alice", displayName: "alice" },
          },
        ],
      },
    ] as never);

    const res = await app.request("/meetings/mtg-1/decision-items");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      assignees: { id: string }[];
    }[];
    expect(body[0].assignees).toHaveLength(1);
    expect(body[0].assignees[0].id).toBe("user-1");
  });
});

// ──────────────────────────────────────────────
// PATCH /decision-items/:id
// ──────────────────────────────────────────────
describe("PATCH /decision-items/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("title 更新が 200 を返す", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(
      mockDecisionItemRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        decisionItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValue({ ...sampleDecisionItem, title: "更新後" }),
        },
        decisionItemAssignee: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
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
    const body = (await res.json()) as { title: string };
    expect(body.title).toBe("更新後");
  });

  it("version 不一致は 409", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(
      mockDecisionItemRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        decisionItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
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

  it("status=decided のとき decidedBy / decidedAt が自動設定される", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(
      mockDecisionItemRaw({ status: "open" }) as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());

    let capturedData: Record<string, unknown> | undefined;
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        decisionItem: {
          updateMany: vi.fn().mockImplementation(({ data }) => {
            capturedData = data;
            return Promise.resolve({ count: 1 });
          }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            ...sampleDecisionItem,
            status: "decided",
            assignees: [],
            meeting: { recurringMeeting: { id: "rmtg-1", name: "週次定例" } },
          }),
        },
        decisionItemAssignee: { deleteMany: vi.fn(), createMany: vi.fn() },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, status: "decided" }),
    });

    expect(res.status).toBe(200);
    expect(capturedData?.decidedBy).toBe("user-1");
    expect(capturedData?.decidedAt).toBeInstanceOf(Date);
  });

  it("decided → open にすると decidedBy / decidedAt がクリアされる", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(
      mockDecisionItemRaw({ status: "decided" }) as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());

    let capturedData: Record<string, unknown> | undefined;
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        decisionItem: {
          updateMany: vi.fn().mockImplementation(({ data }) => {
            capturedData = data;
            return Promise.resolve({ count: 1 });
          }),
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValue({ ...sampleDecisionItem, status: "open" }),
        },
        decisionItemAssignee: { deleteMany: vi.fn(), createMany: vi.fn() },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, status: "open" }),
    });

    expect(res.status).toBe(200);
    expect(capturedData?.decidedBy).toBeNull();
    expect(capturedData?.decidedAt).toBeNull();
  });

  it("status=draft は 400（AI 専用なので手動 PATCH で受け付けない）", async () => {
    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, status: "draft" }),
    });
    expect(res.status).toBe(400);
  });

  it("全フィールド未指定の更新は 400", async () => {
    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it("version 欠落は 400", async () => {
    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新後" }),
    });
    expect(res.status).toBe(400);
  });

  it("決定事項が存在しない場合は 404", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(null);
    const res = await app.request("/decision-items/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, title: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("組織非所属は 404", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(
      mockDecisionItemRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/decision-items/di-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, title: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("assigneeUserIds に他組織のメンバーが混在する場合は 400", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(
      mockDecisionItemRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    // 2 名指定したが 1 名しか組織メンバーとして見つからない
    mockMembershipFindMany.mockResolvedValue([membership()] as never);

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

  it("assigneeUserIds:[] は全削除を行う", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(
      mockDecisionItemRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());

    let deletedAssignees = false;
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        decisionItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            ...sampleDecisionItem,
            assignees: [],
            meeting: { recurringMeeting: { id: "rmtg-1", name: "週次定例" } },
          }),
        },
        decisionItemAssignee: {
          deleteMany: vi.fn(() => {
            deletedAssignees = true;
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
    expect(deletedAssignees).toBe(true);
  });

  it("assigneeUserIds が未指定のとき担当者テーブルは変更しない", async () => {
    mockDecisionItemFindUnique.mockResolvedValue(
      mockDecisionItemRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());

    let calledDeleteMany = false;
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        decisionItem: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue(sampleDecisionItem),
        },
        decisionItemAssignee: {
          deleteMany: vi.fn(() => {
            calledDeleteMany = true;
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
      body: JSON.stringify({ version: 0, title: "更新後" }),
    });

    expect(res.status).toBe(200);
    expect(calledDeleteMany).toBe(false);
  });
});
