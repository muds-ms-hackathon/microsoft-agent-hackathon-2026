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

// schema.prisma で定義した組織関連モデルが PrismaClient にデリゲートされているかを検証する
describe("Organization モデル", () => {
  it("PrismaClient に organization プロパティが存在する", () => {
    expect(prisma.organization).toBeDefined();
    expect(typeof prisma.organization.findMany).toBe("function");
    expect(typeof prisma.organization.create).toBe("function");
    expect(typeof prisma.organization.findUnique).toBe("function");
  });
});

describe("OrganizationMembership モデル", () => {
  it("PrismaClient に organizationMembership プロパティが存在する", () => {
    expect(prisma.organizationMembership).toBeDefined();
    expect(typeof prisma.organizationMembership.findMany).toBe("function");
    expect(typeof prisma.organizationMembership.create).toBe("function");
  });
});

describe("OrganizationInvitation モデル", () => {
  it("PrismaClient に organizationInvitation プロパティが存在する", () => {
    expect(prisma.organizationInvitation).toBeDefined();
    expect(typeof prisma.organizationInvitation.findMany).toBe("function");
    expect(typeof prisma.organizationInvitation.create).toBe("function");
  });
});
