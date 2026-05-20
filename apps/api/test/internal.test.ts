import { beforeEach, describe, expect, it, vi } from "vitest";

// DB をモックしてルートロジックのみを検証する
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    meetingAnalysisRun: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    decisionItem: { createMany: vi.fn() },
    task: { createMany: vi.fn() },
    ambiguousInfo: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import type { Prisma } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const mockFindUnique = vi.mocked(prisma.meetingAnalysisRun.findUnique);
const mockUpdateMany = vi.mocked(prisma.meetingAnalysisRun.updateMany);
const mockTransaction = vi.mocked(prisma.$transaction);

const SECRET = "test-secret";
const AUTH_HEADER = { "x-internal-secret": SECRET };

const baseRun = {
  id: "run-1",
  meetingId: "mtg-1",
  status: "queued",
  triggerType: "manual",
  currentStep: null,
  summary: null,
  alertLevel: null,
  modelName: null,
  apiVersion: null,
  promptVersion: null,
  pipelineVersion: null,
  inputHash: null,
  reportJson: null,
  rawOutputsJson: null,
  validationWarnings: null,
  ragRetrievalJson: null,
  recommendedAgenda: null,
  resourceRefsJson: null,
  startedAt: null,
  completedAt: null,
  failedAt: null,
  errorMessage: null,
  createdAt: new Date("2026-05-17T11:00:00Z"),
  updatedAt: new Date("2026-05-17T11:00:00Z"),
} as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>;

type RunWithMeeting = Prisma.MeetingAnalysisRunGetPayload<{
  include: {
    meeting: {
      include: { recurringMeeting: { select: { organizationId: true } } };
    };
  };
}>;

const baseRunWithMeeting: RunWithMeeting = {
  ...baseRun,
  status: "analyzing",
  meeting: {
    id: "mtg-1",
    recurringMeetingId: "rm-1",
    transcriptText: "transcript",
    supplementaryMemo: null,
    meetingType: null,
    transcriptionQuality: null,
    scheduledAt: null,
    createdAt: new Date("2026-05-17T11:00:00Z"),
    updatedAt: new Date("2026-05-17T11:00:00Z"),
    recurringMeeting: { organizationId: "org-1" },
  },
};

function makeTx() {
  return {
    meetingAnalysisRun: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
    },
    decisionItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    task: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    ambiguousInfo: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

describe("PATCH /internal/analysis-runs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = SECRET;
  });

  it("(a) queued -> analyzing への正常遷移が成功する", async () => {
    const analyzingRun = {
      ...baseRun,
      status: "analyzing",
      startedAt: new Date(),
    };
    mockFindUnique
      .mockResolvedValueOnce({
        ...baseRun,
        status: "queued",
      } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>)
      .mockResolvedValueOnce(
        analyzingRun as Prisma.MeetingAnalysisRunGetPayload<
          Record<string, never>
        >,
      );
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const res = await app.request("/internal/analysis-runs/run-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ status: "analyzing" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("analyzing");
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1", status: "queued" },
        data: expect.objectContaining({ status: "analyzing" }),
      }),
    );
  });

  it("(b) 無効遷移（queued -> failed）は 422 を返す", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...baseRun,
      status: "queued",
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>);

    const res = await app.request("/internal/analysis-runs/run-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ status: "failed" }),
    });

    expect(res.status).toBe(422);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("(c) 同時更新により updateMany の count=0 のとき 409 を返す", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...baseRun,
      status: "queued",
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>);
    mockUpdateMany.mockResolvedValue({ count: 0 });

    const res = await app.request("/internal/analysis-runs/run-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ status: "analyzing" }),
    });

    expect(res.status).toBe(409);
  });

  it("analysis run が存在しない場合は 404", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await app.request("/internal/analysis-runs/run-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ status: "analyzing" }),
    });

    expect(res.status).toBe(404);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe("POST /internal/analysis-runs/:id/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = SECRET;
  });

  it("(a) AI が decisionItem の任意の status を送っても draft で保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    const executionOrder: string[] = [];

    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    tx.decisionItem.createMany.mockImplementation(async () => {
      executionOrder.push("decisionItems");
      return { count: 2 };
    });
    tx.task.createMany.mockImplementation(async () => {
      executionOrder.push("tasks");
      return { count: 1 };
    });
    tx.ambiguousInfo.createMany.mockImplementation(async () => {
      executionOrder.push("ambiguousInfos");
      return { count: 1 };
    });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) =>
      fn(tx),
    );

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decisionItems: [
          { title: "決定事項1", body: "本文1", status: "decided" },
          { title: "決定事項2", status: "cancelled" },
        ],
        tasks: [{ title: "タスク1" }],
        ambiguousInfos: [{ body: "曖昧な箇所1" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(tx.meetingAnalysisRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1", status: "analyzing" },
        data: expect.objectContaining({ status: "completed" }),
      }),
    );
    expect(tx.decisionItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          meetingId: "mtg-1",
          title: "決定事項1",
          body: "本文1",
          sourceQuote: undefined,
          status: "draft",
        },
        {
          meetingId: "mtg-1",
          title: "決定事項2",
          body: undefined,
          sourceQuote: undefined,
          status: "draft",
        },
      ],
    });
    expect(executionOrder).toEqual([
      "decisionItems",
      "tasks",
      "ambiguousInfos",
    ]);
  });

  it("(b) AI が task の任意の status を送っても draft で保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) =>
      fn(tx),
    );

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decisionItems: [{ title: "決定事項1" }],
        tasks: [
          { title: "タスク1", priority: "required", status: "done" },
          { title: "タスク2", status: "in_progress" },
        ],
        ambiguousInfos: [{ body: "曖昧な箇所1" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(tx.task.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: "org-1",
          originMeetingId: "mtg-1",
          title: "タスク1",
          body: undefined,
          sourceQuote: undefined,
          status: "draft",
          priority: "required",
        },
        {
          organizationId: "org-1",
          originMeetingId: "mtg-1",
          title: "タスク2",
          body: undefined,
          sourceQuote: undefined,
          status: "draft",
          priority: null,
        },
      ],
    });
  });

  it("(c) AI が ambiguousInfo の任意の status を送っても draft で保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) =>
      fn(tx),
    );

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decisionItems: [{ title: "決定事項1" }],
        tasks: [{ title: "タスク1" }],
        ambiguousInfos: [
          { body: "曖昧な箇所1", severity: "high", status: "resolved" },
          {
            body: "曖昧な箇所2",
            ambiguityType: "unclear_scope",
            status: "rejected",
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(tx.ambiguousInfo.createMany).toHaveBeenCalledWith({
      data: [
        {
          meetingId: "mtg-1",
          body: "曖昧な箇所1",
          sourceQuote: undefined,
          status: "draft",
          ambiguityType: null,
          severity: "high",
        },
        {
          meetingId: "mtg-1",
          body: "曖昧な箇所2",
          sourceQuote: undefined,
          status: "draft",
          ambiguityType: "unclear_scope",
          severity: null,
        },
      ],
    });
  });

  it("(d) status フィールドありのリクエストでもバリデーションエラーにならず draft で保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) =>
      fn(tx),
    );

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decisionItems: [{ title: "決定事項1", status: "decided" }],
        tasks: [{ title: "タスク1", status: "done" }],
        ambiguousInfos: [{ body: "曖昧な箇所1", status: "resolved" }],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(tx.decisionItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          meetingId: "mtg-1",
          title: "決定事項1",
          body: undefined,
          sourceQuote: undefined,
          status: "draft",
        },
      ],
    });
    expect(tx.task.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: "org-1",
          originMeetingId: "mtg-1",
          title: "タスク1",
          body: undefined,
          sourceQuote: undefined,
          status: "draft",
          priority: null,
        },
      ],
    });
    expect(tx.ambiguousInfo.createMany).toHaveBeenCalledWith({
      data: [
        {
          meetingId: "mtg-1",
          body: "曖昧な箇所1",
          sourceQuote: undefined,
          status: "draft",
          ambiguityType: null,
          severity: null,
        },
      ],
    });
  });

  it("各リストが空の場合でも正常に completed になり 200 を返す", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) =>
      fn(tx),
    );

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decisionItems: [],
        tasks: [],
        ambiguousInfos: [],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(tx.meetingAnalysisRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1", status: "analyzing" },
        data: expect.objectContaining({ status: "completed" }),
      }),
    );
    expect(tx.decisionItem.createMany).not.toHaveBeenCalled();
    expect(tx.task.createMany).not.toHaveBeenCalled();
    expect(tx.ambiguousInfo.createMany).not.toHaveBeenCalled();
  });

  it("INSERT 途中でエラーが発生した場合は transaction が失敗し一部 INSERT 済みとして扱わない", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    const pendingInserts: string[] = [];
    const committedInserts: string[] = [];

    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    tx.decisionItem.createMany.mockImplementation(async () => {
      pendingInserts.push("decisionItems");
      return { count: 1 };
    });
    tx.task.createMany.mockRejectedValue(new Error("INSERT_FAILED"));
    mockTransaction.mockImplementation(
      async (fn: (tx: typeof tx) => Promise<void>) => {
        try {
          await fn(tx);
          committedInserts.push(...pendingInserts);
        } catch (e) {
          pendingInserts.length = 0;
          throw e;
        }
      },
    );

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decisionItems: [{ title: "決定事項1" }],
        tasks: [{ title: "タスク1" }],
        ambiguousInfos: [{ body: "曖昧な箇所1" }],
      }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Internal Server Error");
    expect(tx.decisionItem.createMany).toHaveBeenCalledTimes(1);
    expect(tx.task.createMany).toHaveBeenCalledTimes(1);
    expect(tx.ambiguousInfo.createMany).not.toHaveBeenCalled();
    expect(committedInserts).toEqual([]);
    expect(pendingInserts).toEqual([]);
  });

  it("analyzing 状態でない場合（例: queued）は 422 を返す", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...baseRunWithMeeting,
      status: "queued",
    });
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 0 });
    tx.meetingAnalysisRun.findUnique.mockResolvedValue({
      ...baseRun,
      status: "queued",
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>);
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) =>
      fn(tx),
    );

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decisionItems: [],
        tasks: [],
        ambiguousInfos: [],
      }),
    });

    expect(res.status).toBe(422);
    expect(tx.decisionItem.createMany).not.toHaveBeenCalled();
  });

  it("すでに completed の場合は冪等に 200 を返す", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...baseRunWithMeeting,
      status: "completed",
    });
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 0 });
    tx.meetingAnalysisRun.findUnique.mockResolvedValue({
      ...baseRun,
      status: "completed",
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>);
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) =>
      fn(tx),
    );

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decisionItems: [],
        tasks: [],
        ambiguousInfos: [],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(tx.decisionItem.createMany).not.toHaveBeenCalled();
  });
});
