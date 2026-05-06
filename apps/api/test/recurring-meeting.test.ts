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

// schema.prisma で定義した定例関連モデルが PrismaClient にデリゲートされているかを検証する
describe("RecurringMeeting モデル", () => {
  it("PrismaClient に recurringMeeting プロパティが存在する", () => {
    expect(prisma.recurringMeeting).toBeDefined();
    expect(typeof prisma.recurringMeeting.findMany).toBe("function");
    expect(typeof prisma.recurringMeeting.create).toBe("function");
    expect(typeof prisma.recurringMeeting.findUnique).toBe("function");
  });
});

describe("MeetingMember モデル", () => {
  it("PrismaClient に meetingMember プロパティが存在する", () => {
    expect(prisma.meetingMember).toBeDefined();
    expect(typeof prisma.meetingMember.findMany).toBe("function");
    expect(typeof prisma.meetingMember.create).toBe("function");
  });
});
