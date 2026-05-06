import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, type AuthVariables } from "../middleware/auth.js";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const organizationsRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", auth)
  .get("/", async (c) => {
    const user = c.var.user;
    const orgs = await prisma.organization.findMany({
      where: { memberships: { some: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
    });
    return c.json(orgs);
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    const { name, description } = c.req.valid("json");
    const user = c.var.user;

    // Organization 作成と作成者を owner として登録する Membership 作成は
    // 整合性確保のため $transaction で原子的に実行する。
    const org = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: { name, description },
      });
      await tx.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: created.id,
          role: "owner",
        },
      });
      return created;
    });

    return c.json(org, 201);
  });
