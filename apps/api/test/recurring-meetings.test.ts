import { beforeEach, describe, expect, it, vi } from "vitest";

// Prisma を全モックしてルートロジックのみ検証する。
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    organizationMembership: {
      findUnique: vi.fn(),
    },
    recurringMeeting: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    meetingMember: {
      findUnique: vi.fn(),
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
const mockRecurringFindUnique = vi.mocked(prisma.recurringMeeting.findUnique);
const mockRecurringFindMany = vi.mocked(prisma.recurringMeeting.findMany);
const mockRecurringUpdate = vi.mocked(prisma.recurringMeeting.update);
const mockRecurringDelete = vi.mocked(prisma.recurringMeeting.delete);
const mockMeetingMemberFindUnique = vi.mocked(prisma.meetingMember.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

function membership(role: "owner" | "admin" | "member") {
  return {
    userId: "user-1",
    organizationId: "org-1",
    role,
    joinedAt: new Date("2026-05-01T00:00:00Z"),
  };
}

const sampleRecurring = {
  id: "rmtg-1",
  organizationId: "org-1",
  name: "週次定例",
  description: "毎週月曜",
  scheduleCron: "0 10 * * 1",
  defaultDurationMinutes: 60,
  createdAt: new Date("2026-05-06T00:00:00Z"),
  updatedAt: new Date("2026-05-06T00:00:00Z"),
};

describe("POST /organizations/:id/meetings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("組織メンバーは定例を作成でき、自身を MeetingMember.owner として登録する", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("member"));
    // $transaction はコールバックに tx を渡して RecurringMeeting と
    // MeetingMember.owner を原子的に作成する想定。
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        recurringMeeting: {
          create: vi.fn().mockResolvedValue(sampleRecurring),
        },
        meetingMember: { create: vi.fn().mockResolvedValue({}) },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用のミニマルな tx スタブ
      const result = await (fn as (t: any) => Promise<unknown>)(tx);
      expect(tx.recurringMeeting.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          name: "週次定例",
          description: "毎週月曜",
          scheduleCron: "0 10 * * 1",
          defaultDurationMinutes: 60,
        },
      });
      expect(tx.meetingMember.create).toHaveBeenCalledWith({
        data: {
          recurringMeetingId: "rmtg-1",
          userId: "user-1",
          role: "owner",
        },
      });
      return result;
    });

    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "週次定例",
        description: "毎週月曜",
        scheduleCron: "0 10 * * 1",
        defaultDurationMinutes: 60,
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string };
    expect(body.id).toBe("rmtg-1");
    expect(body.name).toBe("週次定例");
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("description は省略可能", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("member"));
    mockTransaction.mockImplementation(async (fn) => {
      const tx = {
        recurringMeeting: {
          create: vi
            .fn()
            .mockResolvedValue({ ...sampleRecurring, description: null }),
        },
        meetingMember: { create: vi.fn().mockResolvedValue({}) },
      };
      // biome-ignore lint/suspicious/noExplicitAny: テスト用のミニマルな tx スタブ
      return await (fn as (t: any) => Promise<unknown>)(tx);
    });

    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "週次定例",
        scheduleCron: "0 10 * * 1",
        defaultDurationMinutes: 60,
      }),
    });
    expect(res.status).toBe(201);
  });

  it("未所属ユーザーは 404 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "週次定例",
        scheduleCron: "0 10 * * 1",
        defaultDurationMinutes: 60,
      }),
    });
    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("name が空の場合は 400 を返す", async () => {
    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "",
        scheduleCron: "0 10 * * 1",
        defaultDurationMinutes: 60,
      }),
    });
    expect(res.status).toBe(400);
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("name 欠落は 400 を返す", async () => {
    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleCron: "0 10 * * 1",
        defaultDurationMinutes: 60,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("scheduleCron 欠落は 400 を返す", async () => {
    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "週次定例",
        defaultDurationMinutes: 60,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("scheduleCron がフィールド 5 個でない場合は 400 を返す", async () => {
    // MVP 段階では「スペース区切りで 5 フィールド」のみ検証する。
    // 中身（分・時・日・月・曜日）の妥当性検証は後続 Issue で対応。
    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "週次定例",
        scheduleCron: "invalid cron",
        defaultDurationMinutes: 60,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("defaultDurationMinutes 欠落は 400 を返す", async () => {
    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "週次定例",
        scheduleCron: "0 10 * * 1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("defaultDurationMinutes が 0 以下なら 400 を返す", async () => {
    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "週次定例",
        scheduleCron: "0 10 * * 1",
        defaultDurationMinutes: 0,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("defaultDurationMinutes が 480 を超えると 400 を返す", async () => {
    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "週次定例",
        scheduleCron: "0 10 * * 1",
        defaultDurationMinutes: 481,
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /organizations/:id/meetings", () => {
  beforeEach(() => vi.clearAllMocks());

  const listSample = [
    {
      ...sampleRecurring,
      id: "rmtg-2",
      name: "月次レビュー",
      createdAt: new Date("2026-05-08T00:00:00Z"),
      _count: { members: 3 },
    },
    {
      ...sampleRecurring,
      id: "rmtg-1",
      _count: { members: 5 },
    },
  ];

  it("組織メンバーは定例一覧を取得でき、_count.members を含む", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("member"));
    mockRecurringFindMany.mockResolvedValue(listSample as never);

    const res = await app.request("/organizations/org-1/meetings");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{
      id: string;
      _count: { members: number };
    }>;
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("rmtg-2");
    expect(body[0]._count.members).toBe(3);
    expect(body[1].id).toBe("rmtg-1");
    expect(body[1]._count.members).toBe(5);
    expect(mockRecurringFindMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true } } },
    });
  });

  it("定例が無い組織は空配列を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(membership("owner"));
    mockRecurringFindMany.mockResolvedValue([] as never);
    const res = await app.request("/organizations/org-1/meetings");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("未所属ユーザーは 404 を返す", async () => {
    mockMembershipFindUnique.mockResolvedValue(null);
    const res = await app.request("/organizations/org-1/meetings");
    expect(res.status).toBe(404);
    expect(mockRecurringFindMany).not.toHaveBeenCalled();
  });
});

describe("GET /recurring-meetings/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  const sampleMembers = [
    // 並び順検証用に DB 順序を意図的に role 逆順で返し、ハンドラ側で
    // owner → member の順にソートされることを確認する。
    {
      recurringMeetingId: "rmtg-1",
      userId: "user-2",
      role: "member" as const,
      joinedAt: new Date("2026-05-07T00:00:00Z"),
      user: {
        id: "user-2",
        name: "bob",
        displayName: "Bob B.",
        email: "bob@example.com",
      },
    },
    {
      recurringMeetingId: "rmtg-1",
      userId: "user-1",
      role: "owner" as const,
      joinedAt: new Date("2026-05-06T00:00:00Z"),
      user: {
        id: "user-1",
        name: "alice",
        displayName: "Alice A.",
        email: "alice@example.com",
      },
    },
  ];

  it("組織メンバーは定例詳細を取得でき、メンバー一覧を owner→member 順で返す", async () => {
    mockRecurringFindUnique.mockResolvedValue({
      ...sampleRecurring,
      members: sampleMembers,
    } as never);
    mockMembershipFindUnique.mockResolvedValue(membership("member"));

    const res = await app.request("/recurring-meetings/rmtg-1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      members: Array<{ userId: string; role: string; name: string }>;
    };
    expect(body.id).toBe("rmtg-1");
    expect(body.members).toHaveLength(2);
    expect(body.members[0].userId).toBe("user-1");
    expect(body.members[0].role).toBe("owner");
    expect(body.members[0].name).toBe("alice");
    expect(body.members[1].userId).toBe("user-2");
    expect(body.members[1].role).toBe("member");
  });

  it("定例が存在しない場合は 404 を返す", async () => {
    mockRecurringFindUnique.mockResolvedValue(null);

    const res = await app.request("/recurring-meetings/missing");
    expect(res.status).toBe(404);
    // 組織所属チェックに進む前に 404 で短絡する。
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
  });

  it("定例所属組織のメンバーでない場合は 404 を返す", async () => {
    // 組織の存在自体を露出させないため、所属していない場合は 404 で統一する。
    mockRecurringFindUnique.mockResolvedValue({
      ...sampleRecurring,
      members: [],
    } as never);
    mockMembershipFindUnique.mockResolvedValue(null);

    const res = await app.request("/recurring-meetings/rmtg-1");
    expect(res.status).toBe(404);
  });
});

describe("PATCH /recurring-meetings/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("組織メンバーは定例を編集できる（name のみ）", async () => {
    mockRecurringFindUnique.mockResolvedValue(sampleRecurring as never);
    mockMembershipFindUnique.mockResolvedValue(membership("member"));
    mockRecurringUpdate.mockResolvedValue({
      ...sampleRecurring,
      name: "新しい定例名",
    } as never);

    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "新しい定例名" }),
    });
    expect(res.status).toBe(200);
    expect(mockRecurringUpdate).toHaveBeenCalledWith({
      where: { id: "rmtg-1" },
      data: { name: "新しい定例名" },
    });
  });

  it("scheduleCron も編集できる", async () => {
    mockRecurringFindUnique.mockResolvedValue(sampleRecurring as never);
    mockMembershipFindUnique.mockResolvedValue(membership("member"));
    mockRecurringUpdate.mockResolvedValue({
      ...sampleRecurring,
      scheduleCron: "0 14 * * 5",
    } as never);

    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleCron: "0 14 * * 5" }),
    });
    expect(res.status).toBe(200);
    expect(mockRecurringUpdate).toHaveBeenCalledWith({
      where: { id: "rmtg-1" },
      data: { scheduleCron: "0 14 * * 5" },
    });
  });

  it("defaultDurationMinutes も編集できる", async () => {
    mockRecurringFindUnique.mockResolvedValue(sampleRecurring as never);
    mockMembershipFindUnique.mockResolvedValue(membership("member"));
    mockRecurringUpdate.mockResolvedValue({
      ...sampleRecurring,
      defaultDurationMinutes: 90,
    } as never);

    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultDurationMinutes: 90 }),
    });
    expect(res.status).toBe(200);
    expect(mockRecurringUpdate).toHaveBeenCalledWith({
      where: { id: "rmtg-1" },
      data: { defaultDurationMinutes: 90 },
    });
  });

  it("defaultDurationMinutes が 480 を超えると 400 を返す", async () => {
    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultDurationMinutes: 481 }),
    });
    expect(res.status).toBe(400);
    expect(mockRecurringUpdate).not.toHaveBeenCalled();
  });

  it("scheduleCron が不正フォーマットなら 400 を返す", async () => {
    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleCron: "not-a-cron" }),
    });
    expect(res.status).toBe(400);
    expect(mockRecurringUpdate).not.toHaveBeenCalled();
  });

  it("空ボディの PATCH は 400 を返す", async () => {
    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("name が空文字なら 400 を返す", async () => {
    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("定義外フィールドを含む PATCH は 400 を返す", async () => {
    // strict() により未知のフィールドはエラーになる。
    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "新しい名前", unknown: "foo" }),
    });
    expect(res.status).toBe(400);
  });

  it("定例が存在しない場合は 404 を返す", async () => {
    mockRecurringFindUnique.mockResolvedValue(null);
    const res = await app.request("/recurring-meetings/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "新しい名前" }),
    });
    expect(res.status).toBe(404);
    expect(mockRecurringUpdate).not.toHaveBeenCalled();
  });

  it("組織メンバーでなければ 404 を返す", async () => {
    mockRecurringFindUnique.mockResolvedValue(sampleRecurring as never);
    mockMembershipFindUnique.mockResolvedValue(null);

    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "新しい名前" }),
    });
    expect(res.status).toBe(404);
    expect(mockRecurringUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /recurring-meetings/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("MeetingMember.owner は削除でき、204 を返す", async () => {
    mockRecurringFindUnique.mockResolvedValue(sampleRecurring as never);
    mockMembershipFindUnique.mockResolvedValue(membership("member"));
    mockMeetingMemberFindUnique.mockResolvedValue({
      recurringMeetingId: "rmtg-1",
      userId: "user-1",
      role: "owner",
      joinedAt: new Date("2026-05-06T00:00:00Z"),
    });
    mockRecurringDelete.mockResolvedValue(sampleRecurring as never);

    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(mockRecurringDelete).toHaveBeenCalledWith({
      where: { id: "rmtg-1" },
    });
    // 配下の Meeting / MeetingMember は schema 側の onDelete: Cascade に委ねる。
  });

  it("MeetingMember.member は 403 を返す", async () => {
    mockRecurringFindUnique.mockResolvedValue(sampleRecurring as never);
    mockMembershipFindUnique.mockResolvedValue(membership("member"));
    mockMeetingMemberFindUnique.mockResolvedValue({
      recurringMeetingId: "rmtg-1",
      userId: "user-1",
      role: "member",
      joinedAt: new Date("2026-05-06T00:00:00Z"),
    });

    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(403);
    expect(mockRecurringDelete).not.toHaveBeenCalled();
  });

  it("組織メンバーだが MeetingMember 未参加なら 403 を返す", async () => {
    mockRecurringFindUnique.mockResolvedValue(sampleRecurring as never);
    mockMembershipFindUnique.mockResolvedValue(membership("owner"));
    mockMeetingMemberFindUnique.mockResolvedValue(null);

    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(403);
    expect(mockRecurringDelete).not.toHaveBeenCalled();
  });

  it("組織メンバーでなければ 404 を返す", async () => {
    mockRecurringFindUnique.mockResolvedValue(sampleRecurring as never);
    mockMembershipFindUnique.mockResolvedValue(null);

    const res = await app.request("/recurring-meetings/rmtg-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    expect(mockMeetingMemberFindUnique).not.toHaveBeenCalled();
    expect(mockRecurringDelete).not.toHaveBeenCalled();
  });

  it("定例が存在しない場合は 404 を返す", async () => {
    mockRecurringFindUnique.mockResolvedValue(null);
    const res = await app.request("/recurring-meetings/missing", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    expect(mockRecurringDelete).not.toHaveBeenCalled();
  });
});
