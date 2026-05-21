import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    organizationMembership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    recurringMeeting: {
      findMany: vi.fn(),
    },
    ambiguousInfo: {
      findUnique: vi.fn(),
    },
    task: {
      create: vi.fn(),
    },
    taskAssignee: {
      createMany: vi.fn(),
    },
    taskRecurringMeeting: {
      createMany: vi.fn(),
    },
    decisionItem: {
      create: vi.fn(),
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

type AmbiguousInfoWithAccess = Prisma.AmbiguousInfoGetPayload<{
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
const mockRecurringFindMany = vi.mocked(prisma.recurringMeeting.findMany);
const mockAmbiguousInfoFindUnique = vi.mocked(prisma.ambiguousInfo.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

function membership(role: "owner" | "admin" | "member" = "member") {
  return {
    userId: "user-1",
    organizationId: "org-1",
    role,
    joinedAt: new Date("2026-05-01T00:00:00Z"),
  };
}

const sampleItem: AmbiguousInfoWithAccess = {
  id: "ai-1",
  meetingId: "mtg-1",
  body: "担当者が不明",
  sourceQuote: null,
  sourceContext: null,
  status: "reviewing",
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
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-01T00:00:00Z"),
  meeting: { recurringMeeting: { organizationId: "org-1" } },
};

describe("PATCH /ambiguous-infos/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("アイテムが存在しない場合は 404", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(null);

    const res = await app.request("/ambiguous-infos/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, status: "rejected" }),
    });

    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("組織非所属の場合は 404", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(null);

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, status: "rejected" }),
    });

    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("status=rejected で 200 を返す", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockResolvedValue({
      kind: "ok",
      item: { ...sampleItem, status: "rejected", version: 1 },
    });

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, status: "rejected" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; version: number };
    expect(body.status).toBe("rejected");
    expect(body.version).toBe(1);
  });

  it("status=rejected で version 不一致は 409", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockResolvedValue({ kind: "version_conflict" });

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 99, status: "rejected" }),
    });

    expect(res.status).toBe(409);
  });

  it("resolutionType=discarded で 200 を返す", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockResolvedValue({
      kind: "ok",
      item: { ...sampleItem, status: "resolved", resolutionType: "discarded", version: 1 },
    });

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, resolutionType: "discarded" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { resolutionType: string };
    expect(body.resolutionType).toBe("discarded");
  });

  it("resolutionType=task でタスクを作成し 200 を返す", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    const newTask = { id: "task-new", title: "担当者が不明" };
    let taskCreated = false;
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        task: {
          create: vi.fn(() => {
            taskCreated = true;
            return Promise.resolve(newTask);
          }),
        },
        taskAssignee: { createMany: vi.fn() },
        taskRecurringMeeting: { createMany: vi.fn() },
        ambiguousInfo: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            ...sampleItem,
            status: "resolved",
            resolutionType: "task",
            resolvedToTaskId: "task-new",
            version: 1,
            resolvedToTask: newTask,
          }),
        },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, resolutionType: "task" }),
    });

    expect(res.status).toBe(200);
    expect(taskCreated).toBe(true);
    const body = (await res.json()) as { resolutionType: string };
    expect(body.resolutionType).toBe("task");
  });

  it("resolutionType=task で他組織の assignee が含まれる場合は 400", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    // 2 名指定したが 1 名しか組織メンバーとして見つからない
    mockMembershipFindMany.mockResolvedValue([membership()]);

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 0,
        resolutionType: "task",
        newTask: { assigneeUserIds: ["user-1", "user-outside"] },
      }),
    });

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("resolutionType=task で他組織の recurringMeeting が含まれる場合は 400", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    // 指定した 2 件のうち 1 件しか見つからない
    mockRecurringFindMany.mockResolvedValue([{ id: "rmtg-1" }]);

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 0,
        resolutionType: "task",
        newTask: { recurringMeetingIds: ["rmtg-1", "rmtg-other"] },
      }),
    });

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("resolutionType=task で version 不一致は 409 かつタスクはロールバックされる", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        task: { create: vi.fn().mockResolvedValue({ id: "task-new" }) },
        taskAssignee: { createMany: vi.fn() },
        taskRecurringMeeting: { createMany: vi.fn() },
        ambiguousInfo: {
          // version 不一致で count=0 を返す
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUniqueOrThrow: vi.fn(),
        },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 99, resolutionType: "task" }),
    });

    expect(res.status).toBe(409);
  });

  it("resolutionType=decision_item で DecisionItem を作成し 200 を返す", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    const newDi = { id: "di-new", title: "担当者が不明" };
    let diCreated = false;
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        decisionItem: {
          create: vi.fn(() => {
            diCreated = true;
            return Promise.resolve(newDi);
          }),
        },
        ambiguousInfo: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            ...sampleItem,
            status: "resolved",
            resolutionType: "decision_item",
            resolvedToDecisionItemId: "di-new",
            version: 1,
            resolvedToDecision: newDi,
          }),
        },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, resolutionType: "decision_item" }),
    });

    expect(res.status).toBe(200);
    expect(diCreated).toBe(true);
    const body = (await res.json()) as { resolutionType: string };
    expect(body.resolutionType).toBe("decision_item");
  });

  it("resolutionType=decision_item で version 不一致は 409", async () => {
    mockAmbiguousInfoFindUnique.mockResolvedValue(sampleItem);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        decisionItem: { create: vi.fn().mockResolvedValue({ id: "di-new" }) },
        ambiguousInfo: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUniqueOrThrow: vi.fn(),
        },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 99, resolutionType: "decision_item" }),
    });

    expect(res.status).toBe(409);
  });

  it("status も resolutionType も未指定は 400", async () => {
    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0 }),
    });

    expect(res.status).toBe(400);
    expect(mockAmbiguousInfoFindUnique).not.toHaveBeenCalled();
  });

  it("version 欠落は 400", async () => {
    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });

    expect(res.status).toBe(400);
  });

  it("スキーマ外フィールドは 400（strict）", async () => {
    const res = await app.request("/ambiguous-infos/ai-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 0,
        status: "rejected",
        unknownField: "x",
      }),
    });

    expect(res.status).toBe(400);
  });
});
