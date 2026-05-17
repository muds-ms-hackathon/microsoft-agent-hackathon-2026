import { beforeEach, describe, expect, it, vi } from "vitest";

// DB をモックしてルートロジックのみを検証する
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    meeting: {
      findUnique: vi.fn(),
    },
    organizationMembership: {
      findUnique: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
  },
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

import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const mockFindUnique = vi.mocked(prisma.meeting.findUnique);
const mockMembershipFindUnique = vi.mocked(
  prisma.organizationMembership.findUnique,
);
const mockTaskFindMany = vi.mocked(prisma.task.findMany);

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
  };

  const sampleListTask = {
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
    mockFindUnique.mockResolvedValue(meetingWithRecurring as never);
    mockMembershipFindUnique.mockResolvedValue({
      userId: "user-1",
      organizationId: "org-1",
      role: "member",
      joinedAt: new Date(),
    });
    mockTaskFindMany.mockResolvedValue([sampleListTask] as never);

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
    mockFindUnique.mockResolvedValue({
      id: "mtg-x",
      title: "単発",
      heldAt: new Date(),
      recurringMeetingId: null,
      recurringMeeting: null,
    } as never);
    const res = await app.request("/meetings/mtg-x/tasks");
    expect(res.status).toBe(404);
    expect(mockTaskFindMany).not.toHaveBeenCalled();
  });

  it("組織非所属は 404", async () => {
    mockFindUnique.mockResolvedValue(meetingWithRecurring as never);
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
  };

  it("組織メンバーは 200 で詳細を取得できる", async () => {
    mockFindUnique.mockResolvedValue(detailMeeting as never);
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
    };
    expect(body.id).toBe("mtg-1");
    expect(body.title).toBe("第3回");
    expect(body.recurringMeeting).toEqual({ id: "rmtg-1", name: "週次定例" });
    expect(body.organization).toEqual({ id: "org-1", name: "ACME" });
  });

  it("会議不存在は 404", async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/missing");
    expect(res.status).toBe(404);
  });

  it("単発会議（recurringMeetingId=null）は 404", async () => {
    mockFindUnique.mockResolvedValue({
      id: "mtg-x",
      title: "単発",
      heldAt: new Date(),
      recurringMeetingId: null,
      recurringMeeting: null,
    } as never);
    const res = await app.request("/meetings/mtg-x");
    expect(res.status).toBe(404);
  });

  it("組織非所属は 404", async () => {
    mockFindUnique.mockResolvedValue(detailMeeting as never);
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/meetings/mtg-1");
    expect(res.status).toBe(404);
  });
});
