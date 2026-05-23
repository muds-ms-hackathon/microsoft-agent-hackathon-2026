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
  transcriptText: null,
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
    title: "定例会議",
    heldAt: new Date("2026-05-17T10:00:00Z"),
    createdAt: new Date("2026-05-17T10:00:00Z"),
    meetingType: "recurring_meeting",
    transcriptionQuality: null,
    supplementaryMemo: null,
    transcriptText: "テスト書き起こし",
    sequenceNumber: null,
    previousMeetingId: null,
    estimatedDurationMinutes: null,
    estimationNote: null,
    recurringMeetingId: "rm-1",
    recurringMeeting: { organizationId: "org-1" },
  },
};

function makeTx() {
  return {
    meetingAnalysisRun: {
      updateMany: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({ status: "analyzing" }),
    },
    decisionItem: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    task: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    ambiguousInfo: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

// ─── PATCH /internal/analysis-runs/:id ────────────────────────────────────────

describe("PATCH /internal/analysis-runs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = SECRET;
  });

  it("(a) queued -> analyzing への正常遷移が成功する", async () => {
    const analyzingRun = { ...baseRun, status: "analyzing", startedAt: new Date() };
    mockFindUnique
      .mockResolvedValueOnce({ ...baseRun, status: "queued" } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>)
      .mockResolvedValueOnce(analyzingRun as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>);
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

  it("(e) failed 遷移時に error_message と current_step が保存される", async () => {
    const failedRun = { ...baseRun, status: "failed", failedAt: new Date(), errorMessage: "解析失敗" };
    mockFindUnique
      .mockResolvedValueOnce({ ...baseRun, status: "analyzing" } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>)
      .mockResolvedValueOnce(failedRun as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const res = await app.request("/internal/analysis-runs/run-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        status: "failed",
        error_message: "解析失敗",
        current_step: "call2",
      }),
    });

    expect(res.status).toBe(200);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1", status: "analyzing" },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "解析失敗",
          currentStep: "call2",
        }),
      }),
    );
  });
});

// ─── POST /internal/analysis-runs/:id/complete ────────────────────────────────

describe("POST /internal/analysis-runs/:id/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = SECRET;
  });

  // ── 基本的な業務データ作成 ──────────────────────────────────────────────────

  it("(a) decision_items が status=draft で保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decision_items: [
          { title: "決定事項1", body: "本文1" },
          { title: "決定事項2" },
        ],
        tasks: [],
        ambiguous_infos: [],
      }),
    });

    expect(res.status).toBe(200);
    expect(tx.decisionItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          meetingId: "mtg-1",
          title: "決定事項1",
          body: "本文1",
          sourceQuote: null,
          sourceContext: null,
          status: "draft",
          decisionState: null,
          reason: null,
          recurrenceCount: null,
          decisionDeadline: null,
          ambiguityFlags: null,
        },
        {
          meetingId: "mtg-1",
          title: "決定事項2",
          body: null,
          sourceQuote: null,
          sourceContext: null,
          status: "draft",
          decisionState: null,
          reason: null,
          recurrenceCount: null,
          decisionDeadline: null,
          ambiguityFlags: null,
        },
      ],
    });
  });

  it("(b) tasks が status=draft / organizationId 付きで保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decision_items: [],
        tasks: [
          {
            title: "タスク1",
            priority: "required",
            assignee_raw: "田中",
            due_date_raw: "来週月曜",
          },
          { title: "タスク2" },
        ],
        ambiguous_infos: [],
      }),
    });

    expect(res.status).toBe(200);
    expect(tx.task.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: "org-1",
          originMeetingId: "mtg-1",
          decisionItemId: null,
          title: "タスク1",
          body: null,
          sourceQuote: null,
          sourceContext: null,
          status: "draft",
          priority: "required",
          assigneeRaw: "田中",
          dueDateRaw: "来週月曜",
          dueDate: null,
          dueDateEstimated: null,
          startDate: null,
          followUpDate: null,
          carriedOverCount: null,
          ambiguityFlags: null,
          progressNote: null,
        },
        {
          organizationId: "org-1",
          originMeetingId: "mtg-1",
          decisionItemId: null,
          title: "タスク2",
          body: null,
          sourceQuote: null,
          sourceContext: null,
          status: "draft",
          priority: null,
          assigneeRaw: null,
          dueDateRaw: null,
          dueDate: null,
          dueDateEstimated: null,
          startDate: null,
          followUpDate: null,
          carriedOverCount: null,
          ambiguityFlags: null,
          progressNote: null,
        },
      ],
    });
  });

  it("(c) ambiguous_infos が status=draft で保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decision_items: [],
        tasks: [],
        ambiguous_infos: [
          { body: "曖昧な箇所1", severity: "high", ambiguity_type: "unclear_scope" },
          { body: "曖昧な箇所2" },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(tx.ambiguousInfo.createMany).toHaveBeenCalledWith({
      data: [
        {
          meetingId: "mtg-1",
          body: "曖昧な箇所1",
          sourceQuote: null,
          sourceContext: null,
          status: "draft",
          ambiguityType: "unclear_scope",
          severity: "high",
          inferenceBasis: null,
          dueDateRaw: null,
          dueDateEstimated: null,
          affectedItemIds: null,
        },
        {
          meetingId: "mtg-1",
          body: "曖昧な箇所2",
          sourceQuote: null,
          sourceContext: null,
          status: "draft",
          ambiguityType: null,
          severity: null,
          inferenceBasis: null,
          dueDateRaw: null,
          dueDateEstimated: null,
          affectedItemIds: null,
        },
      ],
    });
  });

  // ── snapshot フィールド ─────────────────────────────────────────────────────

  it("snapshot フィールドが MeetingAnalysisRun に保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        summary: "テストサマリー",
        alert_level: "high",
        model_name: "gpt-4o",
        api_version: "2024-05",
        prompt_version: "1.0",
        pipeline_version: "1.0.0",
        input_hash: "abc123",
        transcript_text: "会議の書き起こし",
        report_json: { decisions: [] },
        raw_outputs_json: { call1: "raw" },
        validation_warnings: [{ type: "test_warning" }],
        rag_retrieval_json: { context: "rag_data" },
        recommended_agenda: [{ title: "議題1" }],
        resource_refs_json: null,
        decision_items: [],
        tasks: [],
        ambiguous_infos: [],
      }),
    });

    expect(res.status).toBe(200);
    expect(tx.meetingAnalysisRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1", status: "analyzing" },
        data: expect.objectContaining({
          status: "completed",
          summary: "テストサマリー",
          alertLevel: "high",
          modelName: "gpt-4o",
          apiVersion: "2024-05",
          promptVersion: "1.0",
          pipelineVersion: "1.0.0",
          inputHash: "abc123",
          transcriptText: "会議の書き起こし",
          reportJson: { decisions: [] },
          rawOutputsJson: { call1: "raw" },
          validationWarnings: [{ type: "test_warning" }],
          ragRetrievalJson: { context: "rag_data" },
          recommendedAgenda: [{ title: "議題1" }],
          resourceRefsJson: null,
        }),
      }),
    );
  });

  // ── enum null 丸め ──────────────────────────────────────────────────────────

  it("decision_state が無効値のとき null に丸める", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decision_items: [
          { title: "決定1", decision_state: "invalid_state", reason: "bad_reason" },
        ],
        tasks: [{ title: "タスク1", priority: "urgent" }],
        ambiguous_infos: [
          { body: "曖昧1", ambiguity_type: "unknown_type", severity: "critical" },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(tx.decisionItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ decisionState: null, reason: null })],
      }),
    );
    expect(tx.task.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ priority: null })],
      }),
    );
    expect(tx.ambiguousInfo.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ ambiguityType: null, severity: null })],
      }),
    );
  });

  it("有効な enum 値はそのまま保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decision_items: [
          {
            title: "決定1",
            decision_state: "confirmed",
            reason: "no_consensus",
          },
        ],
        tasks: [],
        ambiguous_infos: [],
      }),
    });

    expect(tx.decisionItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ decisionState: "confirmed", reason: "no_consensus" }),
        ],
      }),
    );
  });

  // ── 日付変換 ───────────────────────────────────────────────────────────────

  it("有効な日付文字列は DateTime として保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decision_items: [
          { title: "決定1", decision_deadline: "2026-06-01" },
        ],
        tasks: [
          {
            title: "タスク1",
            due_date: "2026-06-15T10:00:00Z",
            start_date: "2026-06-01",
            follow_up_date: "2026-06-10",
          },
        ],
        ambiguous_infos: [],
      }),
    });

    expect(tx.decisionItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            decisionDeadline: new Date("2026-06-01"),
          }),
        ],
      }),
    );
    expect(tx.task.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            dueDate: new Date("2026-06-15T10:00:00Z"),
            startDate: new Date("2026-06-01"),
            followUpDate: new Date("2026-06-10"),
          }),
        ],
      }),
    );
  });

  it("無効な日付文字列は null に丸める", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decision_items: [
          { title: "決定1", decision_deadline: "来週月曜" },
        ],
        tasks: [
          { title: "タスク1", due_date: "not-a-date", due_date_raw: "来週月曜" },
        ],
        ambiguous_infos: [],
      }),
    });

    expect(tx.decisionItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ decisionDeadline: null })],
      }),
    );
    expect(tx.task.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            dueDate: null,
            dueDateRaw: "来週月曜",  // 元の文字列は raw に残る
          }),
        ],
      }),
    );
  });

  // ── 拡張 item フィールド ────────────────────────────────────────────────────

  it("decision_items の拡張フィールドが保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decision_items: [
          {
            title: "決定事項1",
            body: "本文",
            source_quote: "書き起こし引用",
            source_context: "前後文脈",
            decision_state: "open",
            reason: "information_lack",
            recurrence_count: 2,
            decision_deadline: "2026-07-01",
            ambiguity_flags: ["flag1"],
          },
        ],
        tasks: [],
        ambiguous_infos: [],
      }),
    });

    expect(tx.decisionItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          meetingId: "mtg-1",
          title: "決定事項1",
          body: "本文",
          sourceQuote: "書き起こし引用",
          sourceContext: "前後文脈",
          status: "draft",
          decisionState: "open",
          reason: "information_lack",
          recurrenceCount: 2,
          decisionDeadline: new Date("2026-07-01"),
          ambiguityFlags: ["flag1"],
        },
      ],
    });
  });

  it("tasks の拡張フィールドが保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decision_items: [],
        tasks: [
          {
            title: "タスク1",
            body: "詳細",
            source_quote: "引用",
            source_context: "文脈",
            priority: "optional",
            assignee_raw: "田中さん",
            due_date_raw: "来週月曜",
            due_date: "2026-06-10",
            due_date_estimated: true,
            start_date: "2026-06-03",
            follow_up_date: "2026-06-07",
            carried_over_count: 1,
            progress_note: "進捗メモ",
          },
        ],
        ambiguous_infos: [],
      }),
    });

    expect(tx.task.createMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: "org-1",
          originMeetingId: "mtg-1",
          decisionItemId: null,
          title: "タスク1",
          body: "詳細",
          sourceQuote: "引用",
          sourceContext: "文脈",
          status: "draft",
          priority: "optional",
          assigneeRaw: "田中さん",
          dueDateRaw: "来週月曜",
          dueDate: new Date("2026-06-10"),
          dueDateEstimated: true,
          startDate: new Date("2026-06-03"),
          followUpDate: new Date("2026-06-07"),
          carriedOverCount: 1,
          ambiguityFlags: null,
          progressNote: "進捗メモ",
        },
      ],
    });
  });

  it("ambiguous_infos の拡張フィールドが保存される", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        decision_items: [],
        tasks: [],
        ambiguous_infos: [
          {
            body: "曖昧な箇所",
            source_quote: "引用",
            source_context: "文脈",
            ambiguity_type: "no_assignee",
            severity: "medium",
            inference_basis: "推定根拠",
            due_date_raw: "来週",
            due_date_estimated: false,
            affected_item_ids: ["T-001"],
          },
        ],
      }),
    });

    expect(tx.ambiguousInfo.createMany).toHaveBeenCalledWith({
      data: [
        {
          meetingId: "mtg-1",
          body: "曖昧な箇所",
          sourceQuote: "引用",
          sourceContext: "文脈",
          status: "draft",
          ambiguityType: "no_assignee",
          severity: "medium",
          inferenceBasis: "推定根拠",
          dueDateRaw: "来週",
          dueDateEstimated: false,
          affectedItemIds: ["T-001"],
        },
      ],
    });
  });

  // ── 冪等性・状態チェック ──────────────────────────────────────────────────

  it("各リストが空でも completed になり 200 を返す", async () => {
    mockFindUnique.mockResolvedValueOnce(baseRunWithMeeting);
    const tx = makeTx();
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ decision_items: [], tasks: [], ambiguous_infos: [] }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: true });
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

  it("analyzing 状態でない場合（queued）は 422 を返す", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...baseRunWithMeeting, status: "queued" });
    const tx = makeTx();
    tx.meetingAnalysisRun.findUnique.mockResolvedValue({ status: "queued" });
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 0 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ decision_items: [], tasks: [], ambiguous_infos: [] }),
    });

    expect(res.status).toBe(422);
    expect(tx.decisionItem.createMany).not.toHaveBeenCalled();
  });

  it("failed の analysis run に complete すると 422 を返す", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...baseRunWithMeeting, status: "failed" });
    const tx = makeTx();
    tx.meetingAnalysisRun.findUnique.mockResolvedValue({ status: "failed" });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ decision_items: [], tasks: [], ambiguous_infos: [] }),
    });

    expect(res.status).toBe(422);
    expect(tx.decisionItem.createMany).not.toHaveBeenCalled();
  });

  it("すでに completed の場合は冪等に 200 を返す（noop パス）", async () => {
    mockFindUnique.mockResolvedValueOnce({ ...baseRunWithMeeting, status: "completed" });
    const tx = makeTx();
    tx.meetingAnalysisRun.findUnique.mockResolvedValue({ status: "completed" });
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 0 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ decision_items: [], tasks: [], ambiguous_infos: [] }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: true });
    expect(tx.decisionItem.createMany).not.toHaveBeenCalled();
  });

  it("CAS conflict で current=completed のとき冪等に 200 を返す", async () => {
    // 外側 findUnique は analyzing を返すが、CAS で updateMany が 0 件になり
    // 再読みしたら completed になっていた（並行リクエストが先に完了させた）ケース
    mockFindUnique.mockResolvedValueOnce({ ...baseRunWithMeeting, status: "analyzing" });
    const tx = makeTx();
    tx.meetingAnalysisRun.findUnique
      .mockResolvedValueOnce({ status: "analyzing" }) // transitionAnalysisRunStatus の先読み
      .mockResolvedValueOnce({ status: "completed" }); // CAS 失敗後の再読み
    tx.meetingAnalysisRun.updateMany.mockResolvedValue({ count: 0 });
    mockTransaction.mockImplementation((fn: (tx: typeof tx) => Promise<void>) => fn(tx));

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ decision_items: [], tasks: [], ambiguous_infos: [] }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()) as { ok: boolean }).toMatchObject({ ok: true });
    expect(tx.decisionItem.createMany).not.toHaveBeenCalled();
  });

  it("recurringMeeting がない meeting では 422 を返す", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...baseRunWithMeeting,
      meeting: { ...baseRunWithMeeting.meeting, recurringMeeting: null },
    });

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ decision_items: [], tasks: [], ambiguous_infos: [] }),
    });

    expect(res.status).toBe(422);
  });

  it("INSERT 途中でエラーが発生した場合は transaction が rollback される", async () => {
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
        decision_items: [{ title: "決定事項1" }],
        tasks: [{ title: "タスク1" }],
        ambiguous_infos: [],
      }),
    });

    expect(res.status).toBe(500);
    expect(committedInserts).toEqual([]);
    expect(pendingInserts).toEqual([]);
  });

  it("analysis run が存在しない場合は 404", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const res = await app.request("/internal/analysis-runs/run-1/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ decision_items: [], tasks: [], ambiguous_infos: [] }),
    });

    expect(res.status).toBe(404);
  });
});
