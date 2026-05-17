import { beforeEach, describe, expect, it, vi } from "vitest";

// Prisma を全モックして tasks ルートのロジックのみを検証する。
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    organizationMembership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    recurringMeeting: {
      findMany: vi.fn(),
    },
    meeting: {
      findUnique: vi.fn(),
    },
    task: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      updateMany: vi.fn(),
    },
    taskAssignee: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    taskRecurringMeeting: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
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
  return {
    defaultUser,
    current: { ...defaultUser },
  };
});

vi.mock("../src/middleware/auth.js", () => ({
  auth: async (
    c: {
      set: (key: string, value: unknown) => void;
    },
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
const mockMembershipFindMany = vi.mocked(
  prisma.organizationMembership.findMany,
);
const mockRecurringFindMany = vi.mocked(prisma.recurringMeeting.findMany);
const mockMeetingFindUnique = vi.mocked(prisma.meeting.findUnique);
const mockTaskFindUnique = vi.mocked(prisma.task.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

function membership(role: "owner" | "admin" | "member" = "member") {
  return {
    userId: "user-1",
    organizationId: "org-1",
    role,
    joinedAt: new Date("2026-05-01T00:00:00Z"),
  };
}

const sampleTask = {
  id: "task-1",
  organizationId: "org-1",
  originMeetingId: null,
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
  organization: { id: "org-1", name: "Org 1" },
  originMeeting: null,
  assignees: [],
  recurringMeetings: [],
};

describe("POST /tasks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("最小パラメータで 201 と status=todo を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockResolvedValue(sampleTask);

    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-1",
        title: "資料作成",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe("task-1");
    expect(body.status).toBe("todo");
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("assignees / recurringMeetings / originMeeting を含む 201", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership());
    // 担当候補が全員 org メンバーであることの検証
    mockMembershipFindMany.mockResolvedValue([
      membership(),
      { ...membership(), userId: "user-2" },
    ]);
    // attached 定例が同一組織に属することの検証
    mockRecurringFindMany.mockResolvedValue([
      { id: "rmtg-1", organizationId: "org-1" },
      { id: "rmtg-2", organizationId: "org-1" },
    ] as never);
    // originMeeting の組織判定（紐付く recurringMeeting 経由）
    mockMeetingFindUnique.mockResolvedValue({
      id: "mtg-1",
      recurringMeetingId: "rmtg-1",
      recurringMeeting: { organizationId: "org-1" },
    } as never);
    mockTransaction.mockResolvedValue({
      ...sampleTask,
      originMeetingId: "mtg-1",
      assignees: [
        {
          user: {
            id: "user-1",
            name: "alice",
            displayName: "alice",
            email: "a@example.com",
          },
        },
        {
          user: {
            id: "user-2",
            name: "bob",
            displayName: "bob",
            email: "b@example.com",
          },
        },
      ],
      recurringMeetings: [
        { recurringMeeting: { id: "rmtg-1", name: "週次定例" } },
        { recurringMeeting: { id: "rmtg-2", name: "月次定例" } },
      ],
    });

    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-1",
        title: "資料作成",
        assigneeUserIds: ["user-1", "user-2"],
        recurringMeetingIds: ["rmtg-1", "rmtg-2"],
        originMeetingId: "mtg-1",
      }),
    });

    expect(res.status).toBe(201);
  });

  it("組織非所属の場合は 404", async () => {
    mockMembershipFindUnique.mockResolvedValue(null);

    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-1",
        title: "資料作成",
      }),
    });

    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("title 欠落は 400", async () => {
    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "org-1" }),
    });
    expect(res.status).toBe(400);
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
  });

  it("organizationId 欠落は 400", async () => {
    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "資料作成" }),
    });
    expect(res.status).toBe(400);
  });

  it("assignee に他組織のメンバーが混在する場合は 400", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership());
    // 2 名指定したが 1 名しか組織メンバーとして見つからない
    mockMembershipFindMany.mockResolvedValue([membership()]);

    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-1",
        title: "資料作成",
        assigneeUserIds: ["user-1", "user-2"],
      }),
    });

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("recurringMeeting に他組織のものが混在する場合は 400", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership());
    // 指定した 2 件のうち 1 件が他組織
    mockRecurringFindMany.mockResolvedValue([
      { id: "rmtg-1", organizationId: "org-1" },
    ] as never);

    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-1",
        title: "資料作成",
        recurringMeetingIds: ["rmtg-1", "rmtg-other"],
      }),
    });

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("originMeeting が他組織なら 400", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockMeetingFindUnique.mockResolvedValue({
      id: "mtg-1",
      recurringMeetingId: "rmtg-other",
      recurringMeeting: { organizationId: "org-other" },
    } as never);

    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-1",
        title: "資料作成",
        originMeetingId: "mtg-1",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("originMeeting が単発会議（recurringMeetingId=null）なら 400", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockMeetingFindUnique.mockResolvedValue({
      id: "mtg-1",
      recurringMeetingId: null,
      recurringMeeting: null,
    } as never);

    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-1",
        title: "資料作成",
        originMeetingId: "mtg-1",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("originMeeting 不存在は 400", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockMeetingFindUnique.mockResolvedValue(null);

    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-1",
        title: "資料作成",
        originMeetingId: "mtg-x",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("ユーザーは status を指定できない（受け付けても無視され todo になる）", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockResolvedValue(sampleTask);

    const res = await app.request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "org-1",
        title: "資料作成",
        status: "done",
      }),
    });

    // status は受け付けないため、リクエストに含めても 201 で status=todo になる。
    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("todo");
  });
});

describe("GET /tasks/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("組織メンバーは関連を含む 200 を取得できる", async () => {
    mockTaskFindUnique.mockResolvedValue({
      ...sampleTask,
      assignees: [
        {
          user: {
            id: "user-1",
            name: "alice",
            displayName: "alice",
            email: "a@example.com",
          },
        },
      ],
      recurringMeetings: [
        { recurringMeeting: { id: "rmtg-1", name: "週次定例" } },
      ],
    } as never);
    mockMembershipFindUnique.mockResolvedValue(membership());

    const res = await app.request("/tasks/task-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      assignees: { id: string }[];
      recurringMeetings: { id: string }[];
    };
    expect(body.id).toBe("task-1");
    expect(body.assignees).toHaveLength(1);
    expect(body.assignees[0].id).toBe("user-1");
    expect(body.recurringMeetings).toHaveLength(1);
    expect(body.recurringMeetings[0].id).toBe("rmtg-1");
  });

  it("タスクが存在しない場合は 404", async () => {
    mockTaskFindUnique.mockResolvedValue(null);
    const res = await app.request("/tasks/missing");
    expect(res.status).toBe(404);
  });

  it("タスク所属組織の非メンバーは 404", async () => {
    mockTaskFindUnique.mockResolvedValue(sampleTask as never);
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/tasks/task-1");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /tasks/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("title 更新が 200、version は updateMany でインクリメントされる", async () => {
    // 認可は requireTaskAccess の findUnique + membership で通す
    mockTaskFindUnique
      .mockResolvedValueOnce(sampleTask as never) // requireTaskAccess の初回呼び出し
      .mockResolvedValueOnce({
        ...sampleTask,
        title: "更新後",
        version: 1,
      } as never); // 再取得
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        task: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi
            .fn()
            .mockResolvedValue({ ...sampleTask, title: "更新後", version: 1 }),
        },
        taskAssignee: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        taskRecurringMeeting: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      const result = await (fn as (t: any) => Promise<unknown>)(tx);
      expect(tx.task.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-1", version: 0 },
          data: expect.objectContaining({
            title: "更新後",
            version: { increment: 1 },
          }),
        }),
      );
      return result;
    });

    const res = await app.request("/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, title: "更新後" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number; title: string };
    expect(body.version).toBe(1);
    expect(body.title).toBe("更新後");
  });

  it("version 不一致は 409", async () => {
    mockTaskFindUnique.mockResolvedValue(sampleTask as never);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        task: {
          // updateMany が 0 件返るのが version 不一致のシグナル
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          findUnique: vi.fn(),
        },
        taskAssignee: { deleteMany: vi.fn(), createMany: vi.fn() },
        taskRecurringMeeting: { deleteMany: vi.fn(), createMany: vi.fn() },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 99, title: "更新後" }),
    });

    expect(res.status).toBe(409);
  });

  it("status を todo→in_progress に変更できる", async () => {
    mockTaskFindUnique.mockResolvedValue(sampleTask as never);
    mockMembershipFindUnique.mockResolvedValue(membership());
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        task: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({
            ...sampleTask,
            status: "in_progress",
            version: 1,
          }),
        },
        taskAssignee: { deleteMany: vi.fn(), createMany: vi.fn() },
        taskRecurringMeeting: { deleteMany: vi.fn(), createMany: vi.fn() },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, status: "in_progress" }),
    });

    expect(res.status).toBe(200);
  });

  it("status=draft は 400（AI 専用なので手動 PATCH で受け付けない）", async () => {
    const res = await app.request("/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, status: "draft" }),
    });
    expect(res.status).toBe(400);
  });

  it("全フィールド未指定の更新は 400", async () => {
    const res = await app.request("/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0 }),
    });
    expect(res.status).toBe(400);
  });

  it("version 欠落は 400", async () => {
    const res = await app.request("/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "更新後" }),
    });
    expect(res.status).toBe(400);
  });

  it("タスクが存在しない場合は 404", async () => {
    mockTaskFindUnique.mockResolvedValue(null);
    const res = await app.request("/tasks/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, title: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("assigneeUserIds の置換で他組織混入は 400", async () => {
    mockTaskFindUnique.mockResolvedValue(sampleTask as never);
    mockMembershipFindUnique.mockResolvedValue(membership());
    // 2 名指定したが 1 名しか組織メンバーとして見つからない
    mockMembershipFindMany.mockResolvedValue([membership()]);

    const res = await app.request("/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: 0,
        assigneeUserIds: ["user-1", "user-outside"],
      }),
    });

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("assigneeUserIds:[] は全削除を行う", async () => {
    mockTaskFindUnique.mockResolvedValue(sampleTask as never);
    mockMembershipFindUnique.mockResolvedValue(membership());
    let deletedAssignees = false;
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        task: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue(sampleTask),
        },
        taskAssignee: {
          deleteMany: vi.fn(() => {
            deletedAssignees = true;
            return Promise.resolve({ count: 0 });
          }),
          createMany: vi.fn(),
        },
        taskRecurringMeeting: { deleteMany: vi.fn(), createMany: vi.fn() },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用 tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/tasks/task-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 0, assigneeUserIds: [] }),
    });

    expect(res.status).toBe(200);
    expect(deletedAssignees).toBe(true);
  });
});
