import { beforeEach, describe, expect, it, vi } from "vitest";

// Prisma を全モックして ambiguous-infos / meetings ルートのロジックのみを検証する。
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    organizationMembership: {
      findUnique: vi.fn(),
    },
    meeting: {
      findUnique: vi.fn(),
    },
    ambiguousInfo: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
    },
    decisionItem: {
      findUnique: vi.fn(),
    },
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
const mockMeetingFindUnique = vi.mocked(prisma.meeting.findUnique);
const mockAmbiguousInfoFindUnique = vi.mocked(prisma.ambiguousInfo.findUnique);
const mockAmbiguousInfoFindMany = vi.mocked(prisma.ambiguousInfo.findMany);
const mockAmbiguousInfoUpdateMany = vi.mocked(prisma.ambiguousInfo.updateMany);
const mockAmbiguousInfoFindUniqueOrThrow = vi.mocked(
  prisma.ambiguousInfo.findUniqueOrThrow,
);
const mockTaskFindUnique = vi.mocked(prisma.task.findUnique);
const mockDecisionItemFindUnique = vi.mocked(prisma.decisionItem.findUnique);

function membership(role: "owner" | "admin" | "member" = "member") {
  return {
    userId: "user-1",
    organizationId: "org-1",
    role,
    joinedAt: new Date("2026-05-01T00:00:00Z"),
  };
}

function mockMeeting() {
  return {
    id: "mtg-1",
    recurringMeetingId: "rmtg-1",
    recurringMeeting: { organizationId: "org-1" },
  };
}

// requireAmbiguousInfoAccess で返すモック（select 形式）。
function mockAmbiguousInfoRaw(overrides = {}) {
  return {
    id: "ai-1",
    meetingId: "mtg-1",
    meeting: { recurringMeeting: { organizationId: "org-1" } },
    ...overrides,
  };
}

const sampleAmbiguousInfo = {
  id: "ai-1",
  meetingId: "mtg-1",
  body: "話者が不明瞭",
  sourceQuote: null,
  sourceContext: null,
  status: "draft" as const,
  ambiguityType: null,
  severity: null,
  inferenceBasis: null,
  dueDateRaw: null,
  dueDateEstimated: null,
  affectedItemIds: null,
  resolutionType: null,
  resolvedToTaskId: null,
  resolvedToDecisionItemId: null,
  version: 0,
  createdAt: new Date("2026-05-17T00:00:00Z"),
  updatedAt: new Date("2026-05-17T00:00:00Z"),
};

// ──────────────────────────────────────────────
// GET /meetings/:id/ambiguous-infos
// ──────────────────────────────────────────────
describe("GET /meetings/:id/ambiguous-infos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("組織メンバーは 200 でリストを取得できる", async () => {
    mockMeetingFindUnique.mockResolvedValue(mockMeeting() as never);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockAmbiguousInfoFindMany.mockResolvedValue([
      sampleAmbiguousInfo,
    ] as never);

    const res = await app.request("/meetings/mtg-1/ambiguous-infos");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string }[];
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("ai-1");
  });

  it("status フィルタで絞り込める", async () => {
    mockMeetingFindUnique.mockResolvedValue(mockMeeting() as never);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockAmbiguousInfoFindMany.mockResolvedValue([] as never);

    const res = await app.request(
      "/meetings/mtg-1/ambiguous-infos?status=resolved",
    );
    expect(res.status).toBe(200);
    expect(mockAmbiguousInfoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["resolved"] },
          meetingId: "mtg-1",
        }),
      }),
    );
  });

  it("不正な status 値は 400", async () => {
    const res = await app.request(
      "/meetings/mtg-1/ambiguous-infos?status=invalid",
    );
    expect(res.status).toBe(400);
  });

  it("会議が存在しない場合は 404", async () => {
    mockMeetingFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/missing/ambiguous-infos");
    expect(res.status).toBe(404);
  });

  it("組織非所属は 404", async () => {
    mockMeetingFindUnique.mockResolvedValue(mockMeeting() as never);
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/mtg-1/ambiguous-infos");
    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────
// PATCH /ambiguous-infos/:id
// ──────────────────────────────────────────────
describe("PATCH /ambiguous-infos/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("status 更新が 200 を返す", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(
      mockAmbiguousInfoRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockAmbiguousInfoUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockAmbiguousInfoFindUniqueOrThrow.mockResolvedValue({
      ...sampleAmbiguousInfo,
      status: "resolved",
      version: 1,
    } as never);

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, status: "resolved" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; version: number };
    expect(body.status).toBe("resolved");
    expect(body.version).toBe(1);
  });

  it("version 不一致は 409", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(
      mockAmbiguousInfoRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockAmbiguousInfoUpdateMany.mockResolvedValue({ count: 0 } as never);

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 99, status: "resolved" }),
    });

    expect(res.status).toBe(409);
  });

  it("status=draft は 400（AI 専用なので手動 PATCH で受け付けない）", async () => {
    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, status: "draft" }),
    });
    expect(res.status).toBe(400);
  });

  it("全フィールド未指定の更新は 400", async () => {
    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it("version 欠落は 400", async () => {
    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    expect(res.status).toBe(400);
  });

  it("曖昧情報が存在しない場合は 404", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(null);
    const res = await app.request("/ambiguous-infos/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, status: "resolved" }),
    });
    expect(res.status).toBe(404);
  });

  it("組織非所属は 404", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(
      mockAmbiguousInfoRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, status: "resolved" }),
    });
    expect(res.status).toBe(404);
  });

  it("resolvedToTaskId が同一会議に属する場合は 200", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(
      mockAmbiguousInfoRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    // task.originMeetingId が同一会議と一致する
    mockTaskFindUnique.mockResolvedValue({
      originMeetingId: "mtg-1",
    } as never);
    mockAmbiguousInfoUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockAmbiguousInfoFindUniqueOrThrow.mockResolvedValue({
      ...sampleAmbiguousInfo,
      resolvedToTaskId: "task-1",
    } as never);

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, resolvedToTaskId: "task-1" }),
    });

    expect(res.status).toBe(200);
  });

  it("resolvedToTaskId が別会議のタスクなら 400", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(
      mockAmbiguousInfoRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    // 別会議のタスク
    mockTaskFindUnique.mockResolvedValue({
      originMeetingId: "mtg-other",
    } as never);

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, resolvedToTaskId: "task-other" }),
    });

    expect(res.status).toBe(400);
    expect(mockAmbiguousInfoUpdateMany).not.toHaveBeenCalled();
  });

  it("resolvedToDecisionItemId が同一会議に属する場合は 200", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(
      mockAmbiguousInfoRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockDecisionItemFindUnique.mockResolvedValue({
      meetingId: "mtg-1",
    } as never);
    mockAmbiguousInfoUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockAmbiguousInfoFindUniqueOrThrow.mockResolvedValue({
      ...sampleAmbiguousInfo,
      resolvedToDecisionItemId: "di-1",
    } as never);

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 0,
        resolvedToDecisionItemId: "di-1",
      }),
    });

    expect(res.status).toBe(200);
  });

  it("resolvedToDecisionItemId が別会議の決定事項なら 400", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(
      mockAmbiguousInfoRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    // 別会議の決定事項
    mockDecisionItemFindUnique.mockResolvedValue({
      meetingId: "mtg-other",
    } as never);

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 0,
        resolvedToDecisionItemId: "di-other",
      }),
    });

    expect(res.status).toBe(400);
    expect(mockAmbiguousInfoUpdateMany).not.toHaveBeenCalled();
  });

  it("resolutionType を null に設定できる", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(
      mockAmbiguousInfoRaw() as never,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockAmbiguousInfoUpdateMany.mockResolvedValue({ count: 1 } as never);
    mockAmbiguousInfoFindUniqueOrThrow.mockResolvedValue({
      ...sampleAmbiguousInfo,
      resolutionType: null,
    } as never);

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, resolutionType: null }),
    });

    expect(res.status).toBe(200);
    expect(mockAmbiguousInfoUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resolutionType: null }),
      }),
    );
  });
});
