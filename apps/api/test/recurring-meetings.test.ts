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
      }),
    });
    expect(res.status).toBe(404);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("name が空の場合は 400 を返す", async () => {
    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", scheduleCron: "0 10 * * 1" }),
    });
    expect(res.status).toBe(400);
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("name 欠落は 400 を返す", async () => {
    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleCron: "0 10 * * 1" }),
    });
    expect(res.status).toBe(400);
  });

  it("scheduleCron 欠落は 400 を返す", async () => {
    const res = await app.request("/organizations/org-1/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "週次定例" }),
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
      }),
    });
    expect(res.status).toBe(400);
  });
});
