import { beforeEach, describe, expect, it, vi } from "vitest";

// DB と Service Bus をモックしてルートロジックのみを検証する
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    meeting: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    organizationMembership: {
      findUnique: vi.fn(),
    },
    task: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../src/lib/service-bus.js", () => ({
  sendMeetingCreatedEvent: vi.fn(),
}));

// auth ミドルウェアの差し替え。既存 GET / POST は auth 未適用のため
// 影響しないが、新規 /:id/tasks では auth.ts を経由するため必要になる。
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
import { sendMeetingCreatedEvent } from "../src/lib/service-bus.js";

const mockFindMany = vi.mocked(prisma.meeting.findMany);
const mockFindUnique = vi.mocked(prisma.meeting.findUnique);
const mockCreate = vi.mocked(prisma.meeting.create);
const mockMembershipFindUnique = vi.mocked(
  prisma.organizationMembership.findUnique,
);
const mockTaskFindMany = vi.mocked(prisma.task.findMany);
const mockSend = vi.mocked(sendMeetingCreatedEvent);

const sampleMeeting = {
  id: "cuid1",
  title: "週次定例",
  heldAt: new Date("2026-04-23T10:00:00Z"),
  createdAt: new Date("2026-04-23T09:00:00Z"),
};

describe("GET /meetings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("200 と meetings 配列を返す", async () => {
    mockFindMany.mockResolvedValue([sampleMeeting]);
    const res = await app.request("/meetings");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("cuid1");
    expect(mockFindMany).toHaveBeenCalledWith({
      orderBy: { heldAt: "desc" },
    });
  });

  it("meetings がない場合は空配列を返す", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await app.request("/meetings");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

describe("POST /meetings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("201 と作成した meeting を返す", async () => {
    mockCreate.mockResolvedValue(sampleMeeting);
    const res = await app.request("/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "週次定例",
        heldAt: "2026-04-23T10:00:00Z",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("cuid1");
    expect(mockCreate).toHaveBeenCalledWith({
      data: { title: "週次定例", heldAt: new Date("2026-04-23T10:00:00Z") },
    });
  });

  it("POST 成功時に Service Bus にイベントを送信する", async () => {
    mockCreate.mockResolvedValue(sampleMeeting);
    await app.request("/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "週次定例",
        heldAt: "2026-04-23T10:00:00Z",
      }),
    });
    expect(mockSend).toHaveBeenCalledWith({
      meetingId: "cuid1",
      title: "週次定例",
    });
  });

  it("title が空の場合は 400 を返す", async () => {
    const res = await app.request("/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", heldAt: "2026-04-23T10:00:00Z" }),
    });
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("heldAt が ISO 8601 でない場合は 400 を返す", async () => {
    const res = await app.request("/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "週次定例", heldAt: "not-a-date" }),
    });
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("Service Bus 送信失敗時も 201 を返す", async () => {
    mockCreate.mockResolvedValue(sampleMeeting);
    mockSend.mockRejectedValue(new Error("connection error"));
    const res = await app.request("/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "週次定例",
        heldAt: "2026-04-23T10:00:00Z",
      }),
    });
    expect(res.status).toBe(201);
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
