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
    topicRequest: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// auth ミドルウェアを差し替え、認証済みユーザーを c.var.user に注入する。
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

// 認可検証で使う meeting 型。recurringMeeting.organizationId のみ含む。
type MeetingWithRecurringOrgId = Prisma.MeetingGetPayload<{
  include: { recurringMeeting: { select: { organizationId: true } } };
}>;

// PATCH/DELETE 用に TopicRequest を meeting → recurringMeeting.organizationId 込みで取得する。
type TopicRequestWithMeeting = Prisma.TopicRequestGetPayload<{
  include: {
    meeting: {
      include: { recurringMeeting: { select: { organizationId: true } } };
    };
  };
}>;

const mockMeetingFindUnique = vi.mocked(prisma.meeting.findUnique);
const mockMembershipFindUnique = vi.mocked(
  prisma.organizationMembership.findUnique,
);
const mockTopicRequestFindUnique = vi.mocked(prisma.topicRequest.findUnique);
const mockTopicRequestFindMany = vi.mocked(prisma.topicRequest.findMany);
const mockTopicRequestCreate = vi.mocked(prisma.topicRequest.create);
const mockTopicRequestUpdate = vi.mocked(prisma.topicRequest.update);
const mockTopicRequestDelete = vi.mocked(prisma.topicRequest.delete);

const meetingWithRecurring = {
  id: "mtg-1",
  title: "第3回",
  heldAt: new Date("2026-05-17T10:00:00Z"),
  recurringMeetingId: "rmtg-1",
  recurringMeeting: { organizationId: "org-1" },
} satisfies Partial<MeetingWithRecurringOrgId>;

function membership(role: "owner" | "admin" | "member" = "member") {
  return {
    userId: "user-1",
    organizationId: "org-1",
    role,
    joinedAt: new Date("2026-05-01T00:00:00Z"),
  };
}

function sampleTopicRequest(overrides: Partial<TopicRequestWithMeeting> = {}) {
  return {
    id: "tr-1",
    meetingId: "mtg-1",
    requestedBy: "user-1",
    title: "次回の議題",
    body: null,
    priority: null,
    createdAt: new Date("2026-05-17T10:00:00Z"),
    updatedAt: new Date("2026-05-17T10:00:00Z"),
    meeting: {
      id: "mtg-1",
      recurringMeeting: { organizationId: "org-1" },
    },
    ...overrides,
  } as unknown as TopicRequestWithMeeting;
}

describe("POST /meetings/:id/topic-requests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("正常系: 201 で作成された議題を返す", async () => {
    mockMeetingFindUnique.mockResolvedValue(
      meetingWithRecurring as unknown as MeetingWithRecurringOrgId,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTopicRequestCreate.mockResolvedValue({
      id: "tr-1",
      meetingId: "mtg-1",
      requestedBy: "user-1",
      title: "次回の議題",
      body: "詳細",
      priority: "required",
      createdAt: new Date("2026-05-17T10:00:00Z"),
      updatedAt: new Date("2026-05-17T10:00:00Z"),
    });

    const res = await app.request("/meetings/mtg-1/topic-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "次回の議題",
        body: "詳細",
        priority: "required",
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({
      id: "tr-1",
      title: "次回の議題",
      body: "詳細",
      priority: "required",
      meetingId: "mtg-1",
      requestedBy: "user-1",
    });

    // requestedBy は認証済みユーザーから埋まり、クライアント指定は無視される
    expect(mockTopicRequestCreate).toHaveBeenCalledWith({
      data: {
        meetingId: "mtg-1",
        requestedBy: "user-1",
        title: "次回の議題",
        body: "詳細",
        priority: "required",
      },
    });
  });

  it("title 省略時は 400", async () => {
    mockMeetingFindUnique.mockResolvedValue(
      meetingWithRecurring as unknown as MeetingWithRecurringOrgId,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());

    const res = await app.request("/meetings/mtg-1/topic-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "詳細" }),
    });
    expect(res.status).toBe(400);
    expect(mockTopicRequestCreate).not.toHaveBeenCalled();
  });

  it("title 空文字は 400", async () => {
    mockMeetingFindUnique.mockResolvedValue(
      meetingWithRecurring as unknown as MeetingWithRecurringOrgId,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());

    const res = await app.request("/meetings/mtg-1/topic-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("組織非所属の場合 404", async () => {
    mockMeetingFindUnique.mockResolvedValue(
      meetingWithRecurring as unknown as MeetingWithRecurringOrgId,
    );
    mockMembershipFindUnique.mockResolvedValue(null);

    const res = await app.request("/meetings/mtg-1/topic-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "次回の議題" }),
    });
    expect(res.status).toBe(404);
    expect(mockTopicRequestCreate).not.toHaveBeenCalled();
  });

  it("会議が存在しない場合 404", async () => {
    mockMeetingFindUnique.mockResolvedValue(null);

    const res = await app.request("/meetings/missing/topic-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "次回の議題" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /meetings/:id/topic-requests", () => {
  beforeEach(() => vi.clearAllMocks());

  it("正常系: 当該会議の議題一覧を createdAt 昇順で返す", async () => {
    mockMeetingFindUnique.mockResolvedValue(
      meetingWithRecurring as unknown as MeetingWithRecurringOrgId,
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTopicRequestFindMany.mockResolvedValue([
      {
        id: "tr-1",
        meetingId: "mtg-1",
        requestedBy: "user-1",
        title: "古い議題",
        body: null,
        priority: null,
        createdAt: new Date("2026-05-17T10:00:00Z"),
        updatedAt: new Date("2026-05-17T10:00:00Z"),
      },
      {
        id: "tr-2",
        meetingId: "mtg-1",
        requestedBy: "user-1",
        title: "新しい議題",
        body: null,
        priority: "optional",
        createdAt: new Date("2026-05-17T11:00:00Z"),
        updatedAt: new Date("2026-05-17T11:00:00Z"),
      },
    ]);

    const res = await app.request("/meetings/mtg-1/topic-requests");
    expect(res.status).toBe(200);
    const json = (await res.json()) as Array<{ id: string }>;
    expect(json.map((x) => x.id)).toEqual(["tr-1", "tr-2"]);
    expect(mockTopicRequestFindMany).toHaveBeenCalledWith({
      where: { meetingId: "mtg-1" },
      orderBy: { createdAt: "asc" },
    });
  });

  it("組織非所属の場合 404", async () => {
    mockMeetingFindUnique.mockResolvedValue(
      meetingWithRecurring as unknown as MeetingWithRecurringOrgId,
    );
    mockMembershipFindUnique.mockResolvedValue(null);

    const res = await app.request("/meetings/mtg-1/topic-requests");
    expect(res.status).toBe(404);
    expect(mockTopicRequestFindMany).not.toHaveBeenCalled();
  });
});

describe("PATCH /topic-requests/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("正常系: 指定フィールドのみ更新する", async () => {
    mockTopicRequestFindUnique.mockResolvedValue(sampleTopicRequest());
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTopicRequestUpdate.mockResolvedValue({
      id: "tr-1",
      meetingId: "mtg-1",
      requestedBy: "user-1",
      title: "更新後タイトル",
      body: null,
      priority: null,
      createdAt: new Date("2026-05-17T10:00:00Z"),
      updatedAt: new Date("2026-05-17T11:00:00Z"),
    });

    const res = await app.request("/topic-requests/tr-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新後タイトル" }),
    });
    expect(res.status).toBe(200);
    expect(mockTopicRequestUpdate).toHaveBeenCalledWith({
      where: { id: "tr-1" },
      data: { title: "更新後タイトル" },
    });
  });

  it("priority を null で送ると未指定にクリアできる", async () => {
    mockTopicRequestFindUnique.mockResolvedValue(
      sampleTopicRequest({ priority: "required" }),
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTopicRequestUpdate.mockResolvedValue({
      id: "tr-1",
      meetingId: "mtg-1",
      requestedBy: "user-1",
      title: "次回の議題",
      body: null,
      priority: null,
      createdAt: new Date("2026-05-17T10:00:00Z"),
      updatedAt: new Date("2026-05-17T11:00:00Z"),
    });

    const res = await app.request("/topic-requests/tr-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: null }),
    });
    expect(res.status).toBe(200);
    expect(mockTopicRequestUpdate).toHaveBeenCalledWith({
      where: { id: "tr-1" },
      data: { priority: null },
    });
  });

  it("空オブジェクトの PATCH は 400", async () => {
    mockTopicRequestFindUnique.mockResolvedValue(sampleTopicRequest());
    mockMembershipFindUnique.mockResolvedValue(membership());

    const res = await app.request("/topic-requests/tr-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(mockTopicRequestUpdate).not.toHaveBeenCalled();
  });

  it("不存在 → 404", async () => {
    mockTopicRequestFindUnique.mockResolvedValue(null);

    const res = await app.request("/topic-requests/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("組織非所属 → 404", async () => {
    mockTopicRequestFindUnique.mockResolvedValue(sampleTopicRequest());
    mockMembershipFindUnique.mockResolvedValue(null);

    const res = await app.request("/topic-requests/tr-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    expect(res.status).toBe(404);
    expect(mockTopicRequestUpdate).not.toHaveBeenCalled();
  });

  it("作成者以外のメンバーも更新可能（MVP: 組織メンバー全員可）", async () => {
    mockTopicRequestFindUnique.mockResolvedValue(
      sampleTopicRequest({ requestedBy: "other-user" }),
    );
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTopicRequestUpdate.mockResolvedValue({
      id: "tr-1",
      meetingId: "mtg-1",
      requestedBy: "other-user",
      title: "他人の議題を編集",
      body: null,
      priority: null,
      createdAt: new Date("2026-05-17T10:00:00Z"),
      updatedAt: new Date("2026-05-17T11:00:00Z"),
    });

    const res = await app.request("/topic-requests/tr-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "他人の議題を編集" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /topic-requests/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("正常系: 204 を返す", async () => {
    mockTopicRequestFindUnique.mockResolvedValue(sampleTopicRequest());
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTopicRequestDelete.mockResolvedValue(
      sampleTopicRequest() as unknown as Prisma.TopicRequestGetPayload<true>,
    );

    const res = await app.request("/topic-requests/tr-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(mockTopicRequestDelete).toHaveBeenCalledWith({
      where: { id: "tr-1" },
    });
  });

  it("不存在 → 404", async () => {
    mockTopicRequestFindUnique.mockResolvedValue(null);

    const res = await app.request("/topic-requests/missing", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    expect(mockTopicRequestDelete).not.toHaveBeenCalled();
  });

  it("組織非所属 → 404", async () => {
    mockTopicRequestFindUnique.mockResolvedValue(sampleTopicRequest());
    mockMembershipFindUnique.mockResolvedValue(null);

    const res = await app.request("/topic-requests/tr-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    expect(mockTopicRequestDelete).not.toHaveBeenCalled();
  });
});
