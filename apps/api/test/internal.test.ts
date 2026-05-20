import { beforeEach, describe, expect, it, vi } from "vitest";

// DB をモックしてルートロジックのみを検証する
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    meetingAnalysisRun: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    decisionItem: { create: vi.fn() },
    task: { create: vi.fn() },
    ambiguousInfo: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import type { Prisma } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const mockFindUnique = vi.mocked(prisma.meetingAnalysisRun.findUnique);
const mockUpdateMany = vi.mocked(prisma.meetingAnalysisRun.updateMany);
const mockTransaction = vi.mocked(prisma.$transaction);

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
    decisionItem: { create: vi.fn().mockResolvedValue({}) },
    task: { create: vi.fn().mockResolvedValue({}) },
    ambiguousInfo: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("PATCH /internal/analysis-runs/:id", () => {
  beforeEach(() => vi.clearAllMocks());

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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "analyzing" }),
    });

    expect(res.status).toBe(409);
  });

  it("analysis run が存在しない場合は 404", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await app.request("/internal/analysis-runs/run-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "analyzing" }),
    });

    expect(res.status).toBe(404);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe("POST /internal/analysis-runs/:id/complete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("(a) analyzing 状態のランが正常に completed になり結果が保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) =>
      fn(tx),
    );

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decisionItems: [{ title: "決定事項1" }],
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
    expect(tx.decisionItem.create).toHaveBeenCalledTimes(1);
    expect(tx.task.create).toHaveBeenCalledTimes(1);
    expect(tx.ambiguousInfo.create).toHaveBeenCalledTimes(1);
  });

  it("(b) analyzing 状態でない場合（例: queued）は 422 を返す", async () => {
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decisionItems: [],
        tasks: [],
        ambiguousInfos: [],
      }),
    });

    expect(res.status).toBe(422);
    expect(tx.decisionItem.create).not.toHaveBeenCalled();
  });

  it("(c) すでに completed の場合は冪等に 200 を返す", async () => {
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decisionItems: [],
        tasks: [],
        ambiguousInfos: [],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(tx.decisionItem.create).not.toHaveBeenCalled();
  });
});
