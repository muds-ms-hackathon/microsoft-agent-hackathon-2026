import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/decision_loop";

// Prisma 7 は接続にアダプターが必要
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

afterAll(async () => {
  await prisma.$disconnect();
});

// schema.prisma で定義したタスク関連モデルが PrismaClient にデリゲートされているかを検証する。
// 手動 CRUD と AI 受入の両経路に向けて organizationId / originMeetingId / progressNote /
// TaskRecurringMeeting 中間テーブルを保持する構造である前提。
describe("Task モデル", () => {
  it("PrismaClient に task プロパティが存在する", () => {
    expect(prisma.task).toBeDefined();
    expect(typeof prisma.task.findMany).toBe("function");
    expect(typeof prisma.task.create).toBe("function");
    expect(typeof prisma.task.findUnique).toBe("function");
  });
});

describe("TaskAssignee モデル", () => {
  it("PrismaClient に taskAssignee プロパティが存在する", () => {
    expect(prisma.taskAssignee).toBeDefined();
    expect(typeof prisma.taskAssignee.findMany).toBe("function");
    expect(typeof prisma.taskAssignee.create).toBe("function");
  });
});

describe("TaskRecurringMeeting モデル", () => {
  it("PrismaClient に taskRecurringMeeting プロパティが存在する", () => {
    expect(prisma.taskRecurringMeeting).toBeDefined();
    expect(typeof prisma.taskRecurringMeeting.findMany).toBe("function");
    expect(typeof prisma.taskRecurringMeeting.create).toBe("function");
  });
});
