import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/decision_loop";

// Prisma 7 は接続にアダプターが必要
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

describe("Meeting モデル", () => {
  it("PrismaClient に meeting プロパティが存在する", () => {
    // meeting モデルが schema.prisma に定義されていれば、
    // クライアントにデリゲートメソッドが生成される
    expect(prisma.meeting).toBeDefined();
    expect(typeof prisma.meeting.findMany).toBe("function");
    expect(typeof prisma.meeting.create).toBe("function");
    expect(typeof prisma.meeting.findUnique).toBe("function");
  });
});
