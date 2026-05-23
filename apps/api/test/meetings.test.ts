import { beforeEach, describe, expect, it, vi } from "vitest";

// DB をモックしてルートロジックのみを検証する
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    meeting: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    organizationMembership: {
      findUnique: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
    decisionItem: {
      findMany: vi.fn(),
    },
    ambiguousInfo: {
      findMany: vi.fn(),
    },
    meetingAnalysisRun: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Service Bus 送信をモックする
vi.mock("../src/lib/service-bus.js", () => ({
  sendToServiceBus: vi.fn().mockResolvedValue(undefined),
}));

// auth ミドルウェアの差し替え。/:id と /:id/tasks は認証必須なので必要。
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

import type { Prisma } from "@prisma/client";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import type {
  ambiguousInfoReviewInclude,
  decisionItemReviewInclude,
  taskReviewInclude,
} from "../src/lib/review-item-serialization.js";
import { sendToServiceBus } from "../src/lib/service-bus.js";
import type { TaskWithList } from "../src/lib/task-serialization.js";

// ハンドラの include / select 形に対応する Prisma 型エイリアス。
// GET /meetings/:id/tasks ハンドラ用: recurringMeeting.organizationId のみ
type MeetingWithRecurringOrgId = Prisma.MeetingGetPayload<{
  include: { recurringMeeting: { select: { organizationId: true } } };
}>;
// GET /meetings/:id ハンドラ用: recurringMeeting に organization (id/name) と analysisRuns を含む
type MeetingDetail = Prisma.MeetingGetPayload<{
  include: {
    recurringMeeting: {
      include: { organization: { select: { id: true; name: true } } };
    };
    analysisRuns: { orderBy: { createdAt: "desc" }; take: 1 };
  };
}>;
// PATCH / POST /meetings/:id ハンドラ用: recurringMeeting.organizationId のみ
type MeetingForUpdate = Prisma.MeetingGetPayload<{
  include: { recurringMeeting: { select: { organizationId: true } } };
}>;
// GET /meetings/:id/review-items ハンドラ用: review include に対応した各テーブルの型
type DecisionItemWithReview = Prisma.DecisionItemGetPayload<{
  include: typeof decisionItemReviewInclude;
}>;
type TaskWithReview = Prisma.TaskGetPayload<{
  include: typeof taskReviewInclude;
}>;
type AmbiguousInfoWithReview = Prisma.AmbiguousInfoGetPayload<{
  include: typeof ambiguousInfoReviewInclude;
}>;

const mockFindUnique = vi.mocked(prisma.meeting.findUnique);
const mockMeetingUpdate = vi.mocked(prisma.meeting.update);
const mockMembershipFindUnique = vi.mocked(
  prisma.organizationMembership.findUnique,
);
const mockTaskFindMany = vi.mocked(prisma.task.findMany);
const mockAnalysisRunCreate = vi.mocked(prisma.meetingAnalysisRun.create);
const mockSendToServiceBus = vi.mocked(sendToServiceBus);
const mockAnalysisRunUpdate = vi.mocked(prisma.meetingAnalysisRun.update);
const mockAnalysisRunFindFirst = vi.mocked(prisma.meetingAnalysisRun.findFirst);
const mockDecisionItemFindMany = vi.mocked(prisma.decisionItem.findMany);
const mockAmbiguousInfoFindMany = vi.mocked(prisma.ambiguousInfo.findMany);

describe("旧 GET / と POST /meetings は撤去済み", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /meetings は 404 を返す（ルート未定義）", async () => {
    const res = await app.request("/meetings");
    expect(res.status).toBe(404);
  });

  it("POST /meetings は 404 を返す（ルート未定義）", async () => {
    const res = await app.request("/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "週次定例",
        heldAt: "2026-04-23T10:00:00Z",
      }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /meetings/:id/tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  const meetingWithRecurring = {
    id: "mtg-1",
    title: "第3回",
    heldAt: new Date("2026-05-17T10:00:00Z"),
    recurringMeetingId: "rmtg-1",
    recurringMeeting: { organizationId: "org-1" },
  } satisfies Partial<MeetingWithRecurringOrgId>;

  const sampleListTask: TaskWithList = {
    id: "task-1",
    organizationId: "org-1",
    originMeetingId: "mtg-1",
    decisionItemId: null,
    title: "資料作成",
    body: null,
    sourceQuote: null,
    sourceContext: null,
    status: "todo",
    priority: null,
    dueDateRaw: null,
    dueDateEstimated: null,
    assigneeRaw: null,
    blockingItemId: null,
    carriedOverCount: null,
    ambiguityFlags: null,
    progressNote: null,
    dueDate: null,
    startDate: null,
    followUpDate: null,
    version: 0,
    createdAt: new Date("2026-05-17T00:00:00Z"),
    updatedAt: new Date("2026-05-17T00:00:00Z"),
    organization: { id: "org-1", name: "ACME" },
    originMeeting: { id: "mtg-1", title: "第3回", heldAt: new Date() },
    assignees: [],
    recurringMeetings: [],
  };

  it("組織メンバーは origin タスクを 200 で取得できる", async () => {
    mockFindUnique.mockResolvedValue(
      meetingWithRecurring as MeetingWithRecurringOrgId,
    );
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date(),
    });
    mockTaskFindMany.mockResolvedValue([sampleListTask]);

    const res = await app.request("/meetings/mtg-1/tasks");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ id: string }>;
    expect(body).toHaveLength(1);
    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ originMeetingId: "mtg-1" }),
      }),
    );
  });

  it("会議不存在は 404", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/missing/tasks");
    expect(res.status).toBe(404);
    expect(mockTaskFindMany).not.toHaveBeenCalled();
  });

  it("単発会議（recurringMeetingId=null）は 404（組織判定不能）", async () => {
    const standalone = {
      id: "mtg-x",
      title: "単発",
      heldAt: new Date(),
      recurringMeetingId: null,
      recurringMeeting: null,
    } satisfies Partial<MeetingWithRecurringOrgId>;
    mockFindUnique.mockResolvedValue(standalone as MeetingWithRecurringOrgId);
    const res = await app.request("/meetings/mtg-x/tasks");
    expect(res.status).toBe(404);
    expect(mockTaskFindMany).not.toHaveBeenCalled();
  });

  it("組織非所属は 404", async () => {
    mockFindUnique.mockResolvedValue(
      meetingWithRecurring as MeetingWithRecurringOrgId,
    );
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/mtg-1/tasks");
    expect(res.status).toBe(404);
    expect(mockTaskFindMany).not.toHaveBeenCalled();
  });
});

describe("GET /meetings/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  const detailMeeting = {
    id: "mtg-1",
    title: "第3回",
    heldAt: new Date("2026-05-17T10:00:00Z"),
    estimatedDurationMinutes: 60,
    estimationNote: null,
    sequenceNumber: 3,
    previousMeetingId: null,
    transcriptText: null,
    transcriptionQuality: null,
    supplementaryMemo: null,
    meetingType: "recurring_meeting",
    recurringMeetingId: "rmtg-1",
    createdAt: new Date("2026-05-01T00:00:00Z"),
    recurringMeeting: {
      id: "rmtg-1",
      name: "週次定例",
      organizationId: "org-1",
      organization: { id: "org-1", name: "ACME" },
    },
    analysisRuns: [],
  } satisfies Partial<MeetingDetail>;

  it("組織メンバーは 200 で詳細を取得できる", async () => {
    mockFindUnique.mockResolvedValue(detailMeeting as MeetingDetail);
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date(),
    });

    const res = await app.request("/meetings/mtg-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      title: string;
      recurringMeeting: { id: string; name: string };
      organization: { id: string; name: string };
      latestAnalysisRun: null;
    };
    expect(body.id).toBe("mtg-1");
    expect(body.title).toBe("第3回");
    expect(body.recurringMeeting).toEqual({ id: "rmtg-1", name: "週次定例" });
    expect(body.organization).toEqual({ id: "org-1", name: "ACME" });
    expect(body.latestAnalysisRun).toBeNull();
  });

  it("解析ランがある場合 latestAnalysisRun を含む", async () => {
    const run = {
      id: "run-1",
      meetingId: "mtg-1",
      status: "completed",
      currentStep: null,
      summary: "テストサマリー",
      alertLevel: "low",
      completedAt: new Date("2026-05-18T12:00:00Z"),
      failedAt: null,
      errorMessage: null,
      triggerType: "manual",
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
      createdAt: new Date("2026-05-18T11:00:00Z"),
      updatedAt: new Date("2026-05-18T12:00:00Z"),
    };
    mockFindUnique.mockResolvedValue({
      ...detailMeeting,
      analysisRuns: [run],
    } as MeetingDetail);
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date(),
    });

    const res = await app.request("/meetings/mtg-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      latestAnalysisRun: {
        id: string;
        status: string;
        summary: string;
        recommendedAgenda: unknown | null;
      };
    };
    expect(body.latestAnalysisRun).not.toBeNull();
    expect(body.latestAnalysisRun?.id).toBe("run-1");
    expect(body.latestAnalysisRun?.status).toBe("completed");
    expect(body.latestAnalysisRun?.summary).toBe("テストサマリー");
    expect(body.latestAnalysisRun?.recommendedAgenda).toBeNull();
  });

  it("解析ランに recommendedAgenda がある場合 レスポンスに含む", async () => {
    const agenda: Prisma.JsonValue = [
      { title: "前回議事録の確認", durationMinutes: 5 },
      { title: "プロジェクト進捗報告", durationMinutes: 20 },
    ];
    const run = {
      id: "run-2",
      meetingId: "mtg-1",
      status: "completed",
      currentStep: null,
      summary: "アジェンダ付きサマリー",
      alertLevel: "low",
      completedAt: new Date("2026-05-18T12:00:00Z"),
      failedAt: null,
      errorMessage: null,
      triggerType: "manual",
      modelName: null,
      apiVersion: null,
      promptVersion: null,
      pipelineVersion: null,
      inputHash: null,
      reportJson: null,
      rawOutputsJson: null,
      validationWarnings: null,
      ragRetrievalJson: null,
      recommendedAgenda: agenda,
      resourceRefsJson: null,
      startedAt: null,
      createdAt: new Date("2026-05-18T11:00:00Z"),
      updatedAt: new Date("2026-05-18T12:00:00Z"),
    };
    mockFindUnique.mockResolvedValue({
      ...detailMeeting,
      analysisRuns: [run],
    } as MeetingDetail);
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date(),
    });

    const res = await app.request("/meetings/mtg-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      latestAnalysisRun: {
        id: string;
        recommendedAgenda: unknown;
      };
    };
    expect(body.latestAnalysisRun?.recommendedAgenda).toEqual(agenda);
  });

  it("会議不存在は 404", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/missing");
    expect(res.status).toBe(404);
  });

  it("単発会議（recurringMeetingId=null）は 404", async () => {
    const standalone = {
      id: "mtg-x",
      title: "単発",
      heldAt: new Date(),
      recurringMeetingId: null,
      recurringMeeting: null,
      analysisRuns: [],
    } satisfies Partial<MeetingDetail>;
    mockFindUnique.mockResolvedValue(standalone as MeetingDetail);
    const res = await app.request("/meetings/mtg-x");
    expect(res.status).toBe(404);
  });

  it("組織非所属は 404", async () => {
    mockFindUnique.mockResolvedValue(detailMeeting as MeetingDetail);
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/mtg-1");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /meetings/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseForUpdate = {
    id: "mtg-1",
    title: "第3回",
    heldAt: new Date("2026-05-17T10:00:00Z"),
    transcriptText: null,
    recurringMeetingId: "rmtg-1",
    recurringMeeting: { organizationId: "org-1" },
  } satisfies Partial<MeetingForUpdate>;

  it("transcriptText を更新できる", async () => {
    mockFindUnique.mockResolvedValue(baseForUpdate as MeetingForUpdate);
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date(),
    });
    mockMeetingUpdate.mockResolvedValue({
      ...baseForUpdate,
      transcriptText: "書き起こしテキスト",
    } as Prisma.MeetingGetPayload<Record<string, never>>);

    const res = await app.request("/meetings/mtg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcriptText: "書き起こしテキスト" }),
    });
    expect(res.status).toBe(200);
    expect(mockMeetingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mtg-1" },
        data: { transcriptText: "書き起こしテキスト" },
      }),
    );
  });

  it("空ボディは 400", async () => {
    const res = await app.request("/meetings/mtg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(mockMeetingUpdate).not.toHaveBeenCalled();
  });

  it("会議不存在は 404", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcriptText: "テスト" }),
    });
    expect(res.status).toBe(404);
    expect(mockMeetingUpdate).not.toHaveBeenCalled();
  });

  it("組織非所属は 404", async () => {
    mockFindUnique.mockResolvedValue(baseForUpdate as MeetingForUpdate);
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/mtg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcriptText: "テスト" }),
    });
    expect(res.status).toBe(404);
    expect(mockMeetingUpdate).not.toHaveBeenCalled();
  });
});

describe("POST /meetings/:id/analyze", () => {
  beforeEach(() => vi.clearAllMocks());

  const meetingWithTranscript = {
    id: "mtg-1",
    title: "第3回",
    heldAt: new Date("2026-05-17T10:00:00Z"),
    transcriptText: "書き起こしテキスト",
    recurringMeetingId: "rmtg-1",
    recurringMeeting: { organizationId: "org-1" },
  } satisfies Partial<MeetingForUpdate & { transcriptText: string }>;

  const meetingWithoutTranscript = {
    ...meetingWithTranscript,
    transcriptText: null,
  };

  it("transcriptText ありの会議は 202 で解析ランを作成する", async () => {
    mockFindUnique.mockResolvedValue(meetingWithTranscript as MeetingForUpdate);
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date(),
    });
    mockAnalysisRunCreate.mockResolvedValue({
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
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>);

    const res = await app.request("/meetings/mtg-1/analyze", {
      method: "POST",
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      analysisRunId: string;
      status: string;
    };
    expect(body.analysisRunId).toBe("run-1");
    expect(body.status).toBe("queued");
    expect(mockAnalysisRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          meetingId: "mtg-1",
          status: "queued",
          triggerType: "manual",
        }),
      }),
    );
    expect(mockSendToServiceBus).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis_run_id: "run-1",
        meeting_id: "mtg-1",
        trigger_type: "transcript_submitted",
      }),
    );
  });

  it("transcriptText が null の場合は 400", async () => {
    mockFindUnique.mockResolvedValue(
      meetingWithoutTranscript as MeetingForUpdate,
    );
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date(),
    });

    const res = await app.request("/meetings/mtg-1/analyze", {
      method: "POST",
    });
    expect(res.status).toBe(400);
    expect(mockAnalysisRunCreate).not.toHaveBeenCalled();
    expect(mockSendToServiceBus).not.toHaveBeenCalled();
  });

  it("会議不存在は 404", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/missing/analyze", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    expect(mockAnalysisRunCreate).not.toHaveBeenCalled();
  });

  it("組織非所属は 404", async () => {
    mockFindUnique.mockResolvedValue(meetingWithTranscript as MeetingForUpdate);
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/mtg-1/analyze", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    expect(mockAnalysisRunCreate).not.toHaveBeenCalled();
  });

  it("(a) SB 失敗 + DB 更新成功: 500 が返り SB エラーがログに出る", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sbError = new Error("Service Bus 接続エラー");

    mockFindUnique.mockResolvedValue(meetingWithTranscript as MeetingForUpdate);
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date(),
    });
    mockAnalysisRunCreate.mockResolvedValue({
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
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>);
    mockSendToServiceBus.mockRejectedValueOnce(sbError);
    mockAnalysisRunUpdate.mockResolvedValue(
      {} as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>,
    );

    const res = await app.request("/meetings/mtg-1/analyze", {
      method: "POST",
    });

    expect(res.status).toBe(500);
    expect(mockAnalysisRunUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[meetings] Service Bus 送信失敗 run=%s:",
      "run-1",
      sbError,
    );
    consoleSpy.mockRestore();
  });

  it("(b) SB 失敗 + DB 更新も失敗: 500 が返り両エラーがログに出る", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sbError = new Error("Service Bus 接続エラー");
    const dbError = new Error("DB 接続エラー");

    mockFindUnique.mockResolvedValue(meetingWithTranscript as MeetingForUpdate);
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date(),
    });
    mockAnalysisRunCreate.mockResolvedValue({
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
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>);
    mockAnalysisRunFindFirst.mockResolvedValueOnce(null);
    mockSendToServiceBus.mockRejectedValueOnce(sbError);
    mockAnalysisRunUpdate.mockRejectedValueOnce(dbError);

    const res = await app.request("/meetings/mtg-1/analyze", {
      method: "POST",
    });

    expect(res.status).toBe(500);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[meetings] Service Bus 送信失敗 run=%s:",
      "run-1",
      sbError,
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      "[meetings] failed 更新も失敗 run=%s:",
      "run-1",
      dbError,
    );
    consoleSpy.mockRestore();
  });

  describe("二重投入防止", () => {
    const runPayload = {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Prisma.MeetingAnalysisRunGetPayload<Record<string, never>>;

    beforeEach(() => {
      mockFindUnique.mockResolvedValue(
        meetingWithTranscript as MeetingForUpdate,
      );
      mockMembershipFindUnique.mockResolvedValue({
        userId: "user-1",
        organizationId: "org-1",
        role: "member",
        joinedAt: new Date(),
      });
    });

    it("(a) queued 状態のランが存在する場合は 409 を返し create を呼ばない", async () => {
      mockAnalysisRunFindFirst.mockResolvedValueOnce({
        ...runPayload,
        id: "run-old",
        status: "queued",
      });

      const res = await app.request("/meetings/mtg-1/analyze", {
        method: "POST",
      });

      expect(res.status).toBe(409);
      expect(mockAnalysisRunCreate).not.toHaveBeenCalled();
    });

    it("(b) analyzing 状態のランが存在する場合は 409 を返し create を呼ばない", async () => {
      mockAnalysisRunFindFirst.mockResolvedValueOnce({
        ...runPayload,
        id: "run-old",
        status: "analyzing",
      });

      const res = await app.request("/meetings/mtg-1/analyze", {
        method: "POST",
      });

      expect(res.status).toBe(409);
      expect(mockAnalysisRunCreate).not.toHaveBeenCalled();
    });

    it("(c) in-flight ランが存在しない場合は create を呼んで 202 を返す", async () => {
      mockAnalysisRunFindFirst.mockResolvedValueOnce(null);
      mockAnalysisRunCreate.mockResolvedValue(runPayload);

      const res = await app.request("/meetings/mtg-1/analyze", {
        method: "POST",
      });

      expect(res.status).toBe(202);
      expect(mockAnalysisRunCreate).toHaveBeenCalled();
    });

    it("(d) 409 のレスポンスボディに正しいエラーメッセージが含まれる", async () => {
      mockAnalysisRunFindFirst.mockResolvedValueOnce({
        ...runPayload,
        id: "run-old",
        status: "queued",
      });

      const res = await app.request("/meetings/mtg-1/analyze", {
        method: "POST",
      });
      const body = (await res.json()) as { error: string };

      expect(body.error).toBe("処理中の解析ジョブが既に存在します");
    });

    it("(e) findFirst に meetingId と status の where 条件が渡される", async () => {
      mockAnalysisRunFindFirst.mockResolvedValueOnce(null);
      mockAnalysisRunCreate.mockResolvedValue(runPayload);

      await app.request("/meetings/mtg-1/analyze", { method: "POST" });

      expect(mockAnalysisRunFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            meetingId: "mtg-1",
            status: { in: ["queued", "analyzing"] },
          },
        }),
      );
    });
  });
});

describe("GET /meetings/:id/review-items", () => {
  beforeEach(() => vi.clearAllMocks());

  const meetingBase = {
    id: "mtg-1",
    recurringMeetingId: "rmtg-1",
    recurringMeeting: { organizationId: "org-1" },
  } as MeetingWithRecurringOrgId;

  function setupAccess() {
    mockFindUnique.mockResolvedValue(meetingBase);
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date(),
    });
  }

  const sampleDecisionItem = {
    id: "di-1",
    meetingId: "mtg-1",
    title: "認証方式を決定する",
    body: null,
    sourceQuote: null,
    sourceContext: null,
    status: "draft",
    decisionState: "confirmed",
    decisionDeadline: null,
    version: 0,
    createdAt: new Date("2026-05-17T00:00:00Z"),
    updatedAt: new Date("2026-05-17T00:00:00Z"),
    assignees: [],
    meeting: { recurringMeetingId: "rmtg-1" },
  } as DecisionItemWithReview;

  const sampleReviewTask = {
    id: "task-review-1",
    organizationId: "org-1",
    originMeetingId: "mtg-1",
    decisionItemId: null,
    title: "ドキュメント整備",
    body: null,
    sourceQuote: null,
    sourceContext: null,
    status: "draft",
    priority: null,
    dueDateRaw: null,
    dueDateEstimated: null,
    assigneeRaw: null,
    blockingItemId: null,
    carriedOverCount: null,
    ambiguityFlags: null,
    progressNote: null,
    dueDate: null,
    startDate: null,
    followUpDate: null,
    version: 0,
    createdAt: new Date("2026-05-17T00:00:00Z"),
    updatedAt: new Date("2026-05-17T00:00:00Z"),
    assignees: [],
    originMeeting: { recurringMeetingId: "rmtg-1" },
  } as TaskWithReview;

  const sampleAmbiguousInfo = {
    id: "ai-1",
    meetingId: "mtg-1",
    body: "要件が不明確",
    sourceQuote: null,
    sourceContext: null,
    status: "draft",
    severity: null,
    version: 0,
    createdAt: new Date("2026-05-17T00:00:00Z"),
    updatedAt: new Date("2026-05-17T00:00:00Z"),
    meeting: { recurringMeetingId: "rmtg-1" },
  } as AmbiguousInfoWithReview;

  it("type 未指定 → 3 テーブル全件を取得して統合レスポンスを返す", async () => {
    setupAccess();
    mockDecisionItemFindMany.mockResolvedValue([sampleDecisionItem]);
    // biome-ignore lint/suspicious/noExplicitAny: TaskWithReview は TaskWithList と include 形が異なるため
    mockTaskFindMany.mockResolvedValue([sampleReviewTask] as any);
    mockAmbiguousInfoFindMany.mockResolvedValue([sampleAmbiguousInfo]);

    const res = await app.request("/meetings/mtg-1/review-items");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      sourceTable: string;
      type: string;
      id: string;
      recurringMeetingId: string | null;
    }>;
    expect(body).toHaveLength(3);
    expect(body[0].sourceTable).toBe("decision_item");
    expect(body[0].type).toBe("decision");
    expect(body[1].sourceTable).toBe("task");
    expect(body[1].type).toBe("task_candidate");
    expect(body[2].sourceTable).toBe("ambiguous_info");
    expect(body[2].type).toBe("ambiguity");
    expect(mockDecisionItemFindMany).toHaveBeenCalledTimes(1);
    expect(mockTaskFindMany).toHaveBeenCalledTimes(1);
    expect(mockAmbiguousInfoFindMany).toHaveBeenCalledTimes(1);
  });

  it("?type=decision → confirmed/tentative 制約が where に入り task・ambiguity は呼ばれない", async () => {
    setupAccess();
    mockDecisionItemFindMany.mockResolvedValue([sampleDecisionItem]);

    const res = await app.request("/meetings/mtg-1/review-items?type=decision");
    expect(res.status).toBe(200);
    expect(mockDecisionItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          meetingId: "mtg-1",
          decisionState: { in: ["confirmed", "tentative"] },
        }),
      }),
    );
    expect(mockTaskFindMany).not.toHaveBeenCalled();
    expect(mockAmbiguousInfoFindMany).not.toHaveBeenCalled();
  });

  it("?type=open_issue → OR 条件が where に入り task・ambiguity は呼ばれない", async () => {
    setupAccess();
    const openItem = {
      ...sampleDecisionItem,
      id: "di-open",
      decisionState: "open",
    } as DecisionItemWithReview;
    mockDecisionItemFindMany.mockResolvedValue([openItem]);

    const res = await app.request(
      "/meetings/mtg-1/review-items?type=open_issue",
    );
    expect(res.status).toBe(200);
    expect(mockDecisionItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ decisionState: "open" }, { decisionState: null }],
        }),
      }),
    );
    expect(mockTaskFindMany).not.toHaveBeenCalled();
    expect(mockAmbiguousInfoFindMany).not.toHaveBeenCalled();
  });

  it("?type=task_candidate → task のみ呼ばれ decisionItem・ambiguousInfo は呼ばれない", async () => {
    setupAccess();
    // biome-ignore lint/suspicious/noExplicitAny: TaskWithReview は TaskWithList と include 形が異なるため
    mockTaskFindMany.mockResolvedValue([sampleReviewTask] as any);

    const res = await app.request(
      "/meetings/mtg-1/review-items?type=task_candidate",
    );
    expect(res.status).toBe(200);
    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ originMeetingId: "mtg-1" }),
      }),
    );
    expect(mockDecisionItemFindMany).not.toHaveBeenCalled();
    expect(mockAmbiguousInfoFindMany).not.toHaveBeenCalled();
  });

  it("?type=ambiguity → ambiguousInfo のみ呼ばれ decisionItem・task は呼ばれない", async () => {
    setupAccess();
    mockAmbiguousInfoFindMany.mockResolvedValue([sampleAmbiguousInfo]);

    const res = await app.request(
      "/meetings/mtg-1/review-items?type=ambiguity",
    );
    expect(res.status).toBe(200);
    expect(mockAmbiguousInfoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ meetingId: "mtg-1" }),
      }),
    );
    expect(mockDecisionItemFindMany).not.toHaveBeenCalled();
    expect(mockTaskFindMany).not.toHaveBeenCalled();
  });

  it("?type=decision,task_candidate → decisionItem・task が呼ばれ ambiguousInfo は呼ばれない", async () => {
    setupAccess();
    mockDecisionItemFindMany.mockResolvedValue([sampleDecisionItem]);
    // biome-ignore lint/suspicious/noExplicitAny: TaskWithReview は TaskWithList と include 形が異なるため
    mockTaskFindMany.mockResolvedValue([sampleReviewTask] as any);

    const res = await app.request(
      "/meetings/mtg-1/review-items?type=decision,task_candidate",
    );
    expect(res.status).toBe(200);
    expect(mockDecisionItemFindMany).toHaveBeenCalledTimes(1);
    expect(mockTaskFindMany).toHaveBeenCalledTimes(1);
    expect(mockAmbiguousInfoFindMany).not.toHaveBeenCalled();
  });

  it("?type=decision,open_issue → decisionItem のみ呼ばれ decisionState 制約なし", async () => {
    setupAccess();
    mockDecisionItemFindMany.mockResolvedValue([sampleDecisionItem]);

    const res = await app.request(
      "/meetings/mtg-1/review-items?type=decision,open_issue",
    );
    expect(res.status).toBe(200);
    const callWhere = mockDecisionItemFindMany.mock.calls[0][0].where as Record<
      string,
      unknown
    >;
    // decision + open_issue の組み合わせは全 decisionState を含むため where に制約が入らない
    expect(callWhere).not.toHaveProperty("decisionState");
    expect(callWhere).not.toHaveProperty("OR");
    expect(mockTaskFindMany).not.toHaveBeenCalled();
    expect(mockAmbiguousInfoFindMany).not.toHaveBeenCalled();
  });

  it("?type 不正値は 400", async () => {
    const res = await app.request("/meetings/mtg-1/review-items?type=unknown");
    expect(res.status).toBe(400);
    expect(mockDecisionItemFindMany).not.toHaveBeenCalled();
  });

  it("会議不存在は 404", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/missing/review-items");
    expect(res.status).toBe(404);
    expect(mockDecisionItemFindMany).not.toHaveBeenCalled();
  });

  it("組織非所属は 404", async () => {
    mockFindUnique.mockResolvedValue(meetingBase);
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/mtg-1/review-items");
    expect(res.status).toBe(404);
    expect(mockDecisionItemFindMany).not.toHaveBeenCalled();
  });
});
