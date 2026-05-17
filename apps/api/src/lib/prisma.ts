import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { requireEnv } from "./env.js";

// 本番 (NODE_ENV=production) で DATABASE_URL が未設定だと起動時に throw する。
// 開発 / テスト時は docker-compose の既定値にフォールバックする。
const connectionString = requireEnv(
  "DATABASE_URL",
  "postgresql://postgres:postgres@localhost:5432/decision_loop",
);

const adapter = new PrismaPg({ connectionString });
export const prisma = new PrismaClient({ adapter });
