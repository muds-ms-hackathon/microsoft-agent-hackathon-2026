import { beforeEach, describe, expect, it, vi } from "vitest";

// DB をモックする
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    meetingAnalysisRun: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    topicRequest: {
      findMany: vi.fn(),
    },
  },
}));

import type { Prisma } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const mockRunFindUnique = vi.mocked(prisma.meetingAnalysisRun.findUnique);
const mockRunFindFirst = vi.mocked(prisma.meetingAnalysisRun.findFirst);
const mockRunUpdateMany = vi.mocked(prisma.meetingAnalysisRun.updateMany);
const mockTopicRequestFindMany = vi.mocked(prisma.topicRequest.findMany);

const SECRET = "test-secret";
const AUTH_HEADER = { "x-internal-secret": SECRET };

// GET /internal/analysis-runs/:id/input で返る include の型
type RunWithMeeting = Prisma.MeetingAnalysisRunGetPayload<{
  include: { meeting: { include: { speakers: true } } };
}>;

const baseSpeaker = {
  id: "spk-1",
  meetingId: "mtg-1",
  userId: null,
  name: "田中",
  resolutionStatus: "resolved" as const,
  sourceLabel: null,
  createdAt: new Date("2026-05-17T00:00:00Z"),
  updatedAt: new Date("2026-05-17T00:00:00Z"),
};

const baseMeeting = {
  id: "mtg-1",
  title: "第3回",
  heldAt: new Date("2026-05-17T10:00:00Z"),
  createdAt: new Date("2026-05-01T00:00:00Z"),
  meetingType: "recurring_meeting",
  transcriptionQuality: null,
  supplementaryMemo: null,
  transcriptText: "テスト書き起こし",
  sequenceNumber: 3,
  previousMeetingId: null,
  estimatedDurationMinutes: 60,
  estimationNote: null,
  recurringMeetingId: "rmtg-1",
  speakers: [baseSpeaker],
};

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
  meeting: baseMeeting,
};

describe("GET /internal/analysis-runs/:id/input", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = SECRET;
    // topic-requests のデフォルトは空配列。AI Service 側が必ず key を取得できるよう、
    // 0 件の Meeting でも user_topic_requests を含めて返す挙動を維持する。
    mockTopicRequestFindMany.mockResolvedValue([]);
  });

  it("存在する解析ランの入力情報を 200 で返す", async () => {
    mockRunFindUnique.mockResolvedValue(baseRun as RunWithMeeting);

    const res = await app.request("/internal/analysis-runs/run-1/input", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      analysis_run_id: string;
      meeting_id: string;
      transcript: string;
      meeting_date: string;
      transcription_quality: string;
      speakers: Array<{ speaker_key: string; name: string }>;
      previous_report_json: null;
      user_topic_requests: unknown[];
    };
    expect(body.analysis_run_id).toBe("run-1");
    expect(body.meeting_id).toBe("mtg-1");
    expect(body.transcript).toBe("テスト書き起こし");
    expect(body.meeting_date).toBe("2026-05-17");
    expect(body.transcription_quality).toBe("full");
    expect(body.speakers).toHaveLength(1);
    expect(body.speakers[0]?.speaker_key).toBe("spk-1");
    expect(body.speakers[0]?.name).toBe("田中");
    expect(body.previous_report_json).toBeNull();
    // topic-requests 未登録時でも user_topic_requests は空配列で必ず含まれる
    expect(body.user_topic_requests).toEqual([]);
  });

  it("ユーザー入力議題があれば user_topic_requests に createdAt 昇順で含まれる", async () => {
    mockRunFindUnique.mockResolvedValue(baseRun as RunWithMeeting);
    mockTopicRequestFindMany.mockResolvedValue([
      {
        id: "tr-1",
        meetingId: "mtg-1",
        requestedBy: "user-1",
        title: "古い議題",
        body: null,
        priority: null,
        createdAt: new Date("2026-05-17T09:00:00Z"),
        updatedAt: new Date("2026-05-17T09:00:00Z"),
        requester: { displayName: "alice" },
        // satisfies で型を明示せず、include を含む payload としてキャストする
      },
      {
        id: "tr-2",
        meetingId: "mtg-1",
        requestedBy: "user-2",
        title: "新しい議題",
        body: "詳細",
        priority: "required",
        createdAt: new Date("2026-05-17T10:00:00Z"),
        updatedAt: new Date("2026-05-17T10:00:00Z"),
        requester: { displayName: "bob" },
      },
    ] as unknown as Prisma.TopicRequestGetPayload<{
      include: { requester: { select: { displayName: true } } };
    }>[]);

    const res = await app.request("/internal/analysis-runs/run-1/input", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user_topic_requests: Array<{
        title: string;
        body: string | null;
        priority: string | null;
        requested_by_name: string;
      }>;
    };
    expect(body.user_topic_requests).toEqual([
      {
        title: "古い議題",
        body: null,
        priority: null,
        requested_by_name: "alice",
      },
      {
        title: "新しい議題",
        body: "詳細",
        priority: "required",
        requested_by_name: "bob",
      },
    ]);
    expect(mockTopicRequestFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { meetingId: "mtg-1" },
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  it("前回会議の completed 解析ランがある場合 previous_report_json を含む", async () => {
    const meetingWithPrev = {
      ...baseMeeting,
      previousMeetingId: "mtg-0",
    };
    mockRunFindUnique.mockResolvedValue({
      ...baseRun,
      meeting: meetingWithPrev,
    } as RunWithMeeting);
    mockRunFindFirst.mockResolvedValue({
      ...baseRun,
      id: "run-prev",
      meetingId: "mtg-0",
      status: "completed",
      reportJson: { summary: "前回サマリー" },
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>);

    const res = await app.request("/internal/analysis-runs/run-1/input", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      previous_meeting_id: string;
      previous_report_json: { summary: string } | null;
    };
    expect(body.previous_meeting_id).toBe("mtg-0");
    expect(body.previous_report_json).toEqual({ summary: "前回サマリー" });
    expect(mockRunFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          meetingId: "mtg-0",
          status: "completed",
        }),
      }),
    );
  });

  it("前回会議があっても completed ランがなければ previous_report_json は null", async () => {
    const meetingWithPrev = {
      ...baseMeeting,
      previousMeetingId: "mtg-0",
    };
    mockRunFindUnique.mockResolvedValue({
      ...baseRun,
      meeting: meetingWithPrev,
    } as RunWithMeeting);
    mockRunFindFirst.mockResolvedValue(null);

    const res = await app.request("/internal/analysis-runs/run-1/input", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { previous_report_json: null };
    expect(body.previous_report_json).toBeNull();
  });

  it("存在しない解析ランは 404", async () => {
    mockRunFindUnique.mockResolvedValue(null);
    const res = await app.request("/internal/analysis-runs/missing/input", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(404);
  });

  it("認証ヘッダなしは 401", async () => {
    const res = await app.request("/internal/analysis-runs/run-1/input");
    expect(res.status).toBe(401);
  });
});

describe("GET /internal/analysis-runs/:id/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = SECRET;
  });

  it("存在する解析ランの status を返す", async () => {
    mockRunFindUnique.mockResolvedValue(
      baseRun as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>,
    );

    const res = await app.request("/internal/analysis-runs/run-1/status", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe("run-1");
    expect(body.status).toBe("queued");
  });

  it("存在しない解析ランは 404", async () => {
    mockRunFindUnique.mockResolvedValue(null);

    const res = await app.request("/internal/analysis-runs/missing/status", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(404);
  });

  it("認証ヘッダなしは 401", async () => {
    const res = await app.request("/internal/analysis-runs/run-1/status");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /internal/analysis-runs/:id/result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_SECRET = SECRET;
  });

  const existingRun = {
    ...baseRun,
  } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>;

  it("completed ステータスで解析結果を保存できる", async () => {
    const updatedRun = {
      ...existingRun,
      status: "completed",
      summary: "解析サマリー",
      alertLevel: "low",
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>;
    mockRunFindUnique
      .mockResolvedValueOnce(existingRun) // 1回目：404チェック
      .mockResolvedValueOnce(updatedRun); // 2回目：更新後の再取得
    mockRunUpdateMany.mockResolvedValue({ count: 1 });

    const res = await app.request("/internal/analysis-runs/run-1/result", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        status: "completed",
        summary: "解析サマリー",
        alert_level: "low",
        report_json: { decisions: [] },
        completed_at: "2026-05-17T12:00:00Z",
      }),
    });
    expect(res.status).toBe(200);
    expect(mockRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1", status: { notIn: ["completed", "failed"] } },
        data: expect.objectContaining({
          status: "completed",
          summary: "解析サマリー",
          alertLevel: "low",
          reportJson: { decisions: [] },
          completedAt: new Date("2026-05-17T12:00:00Z"),
        }),
      }),
    );
  });

  it("failed ステータスでエラー情報を保存できる", async () => {
    const updatedRun = {
      ...existingRun,
      status: "failed",
      errorMessage: "解析エラー",
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>;
    mockRunFindUnique
      .mockResolvedValueOnce(existingRun)
      .mockResolvedValueOnce(updatedRun);
    mockRunUpdateMany.mockResolvedValue({ count: 1 });

    const res = await app.request("/internal/analysis-runs/run-1/result", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({
        status: "failed",
        error_message: "解析エラー",
        failed_at: "2026-05-17T12:00:00Z",
        current_step: "call2",
      }),
    });
    expect(res.status).toBe(200);
    expect(mockRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "解析エラー",
          currentStep: "call2",
          failedAt: new Date("2026-05-17T12:00:00Z"),
        }),
      }),
    );
  });

  it("すでに completed 状態のrunは更新せずに現状を返す", async () => {
    const completedRun = {
      ...existingRun,
      status: "completed",
      summary: "既存サマリー",
      alertLevel: "high",
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>;
    mockRunFindUnique
      .mockResolvedValueOnce(completedRun) // 1回目：404チェック
      .mockResolvedValueOnce(completedRun); // 2回目：再取得（更新なし）
    mockRunUpdateMany.mockResolvedValue({ count: 0 });

    const res = await app.request("/internal/analysis-runs/run-1/result", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ status: "failed", error_message: "再配送エラー" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      summary: string;
      errorMessage: null;
    };
    expect(body.status).toBe("completed");
    expect(body.summary).toBe("既存サマリー");
    expect(body.errorMessage).toBeNull(); // リクエストの値で上書きされていない
    expect(mockRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1", status: { notIn: ["completed", "failed"] } },
      }),
    );
  });

  it("すでに failed 状態のrunは更新せずに現状を返す", async () => {
    const failedRun = {
      ...existingRun,
      status: "failed",
      errorMessage: "元のエラー",
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>;
    mockRunFindUnique
      .mockResolvedValueOnce(failedRun)
      .mockResolvedValueOnce(failedRun);
    mockRunUpdateMany.mockResolvedValue({ count: 0 });

    const res = await app.request("/internal/analysis-runs/run-1/result", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ status: "completed", summary: "上書き試み" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      summary: null;
      errorMessage: string;
    };
    expect(body.status).toBe("failed");
    expect(body.errorMessage).toBe("元のエラー");
    expect(body.summary).toBeNull(); // リクエストの値で上書きされていない
    expect(mockRunUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1", status: { notIn: ["completed", "failed"] } },
      }),
    );
  });

  it("不正な status は 400", async () => {
    const res = await app.request("/internal/analysis-runs/run-1/result", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ status: "queued" }),
    });
    expect(res.status).toBe(400);
    expect(mockRunUpdateMany).not.toHaveBeenCalled();
  });

  it("存在しない解析ランは 404", async () => {
    mockRunFindUnique.mockResolvedValue(null);
    const res = await app.request("/internal/analysis-runs/missing/result", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...AUTH_HEADER },
      body: JSON.stringify({ status: "completed" }),
    });
    expect(res.status).toBe(404);
    expect(mockRunUpdateMany).not.toHaveBeenCalled();
  });

  it("認証ヘッダなしは 401", async () => {
    const res = await app.request("/internal/analysis-runs/run-1/result", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    expect(res.status).toBe(401);
    expect(mockRunUpdateMany).not.toHaveBeenCalled();
  });
});
