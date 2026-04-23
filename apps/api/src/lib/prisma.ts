import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/decision_loop";

const adapter = new PrismaPg({ connectionString });
export const prisma = new PrismaClient({ adapter });
