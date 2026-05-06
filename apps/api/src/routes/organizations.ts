import { zValidator } from "@hono/zod-validator";
import {
  type OrganizationMembership,
  type OrgRole,
  Prisma,
} from "@prisma/client";
import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { auth, type AuthVariables } from "../middleware/auth.js";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

// 全フィールド optional だが、name を渡す場合は空文字列を弾く。
// 全フィールド未指定の空ボディは更新意図が不明瞭なため 400 で弾く。
const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  .strict()
  .refine(
    (d) => d.name !== undefined || d.description !== undefined,
    { message: "更新する項目を 1 つ以上指定してください" },
  );

// owner ロールの招待は不可（owner は組織作成者のみ）。
// expiresInDays は 1〜365 日。email はサーバ側で trim + 小文字化して保存・比較する。
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "member"]).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

// 認証ユーザーが対象組織に所属しており、許容ロールに含まれているかを判定する。
// 所属していない場合は組織の存在自体を露出させないため 404 で統一する。
// allowed=null は「所属していれば誰でも可」を意味する（詳細閲覧用）。
async function requireRole(
  c: Context<{ Variables: AuthVariables }>,
  organizationId: string,
  allowed: OrgRole[] | null,
  forbiddenMessage: string,
): Promise<
  | { ok: true; membership: OrganizationMembership }
  | { ok: false; res: Response }
> {
  const user = c.var.user;
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: { userId: user.id, organizationId },
    },
  });
  if (!membership) {
    return {
      ok: false,
      res: c.json({ error: "組織が見つかりません" }, 404),
    };
  }
  if (allowed && !allowed.includes(membership.role)) {
    return {
      ok: false,
      res: c.json({ error: forbiddenMessage }, 403),
    };
  }
  return { ok: true, membership };
}

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
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");

    const guard = await requireRole(c, id, null, "");
    if (!guard.ok) return guard.res;

    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) {
      return c.json({ error: "組織が見つかりません" }, 404);
    }
    return c.json(org);
  })
  .patch("/:id", zValidator("json", updateSchema), async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const guard = await requireRole(
      c,
      id,
      ["owner", "admin"],
      "編集権限がありません",
    );
    if (!guard.ok) return guard.res;

    const updated = await prisma.organization.update({
      where: { id },
      data,
    });
    return c.json(updated);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");

    const guard = await requireRole(c, id, ["owner"], "削除権限がありません");
    if (!guard.ok) return guard.res;

    // schema 側で Membership / Invitation / RecurringMeeting / MeetingMember は
    // onDelete: Cascade のため delete 一発で連鎖削除される。
    const deleted = await prisma.organization.delete({ where: { id } });
    return c.json(deleted);
  })
  .post("/:id/invite", zValidator("json", inviteSchema), async (c) => {
    const id = c.req.param("id");
    const user = c.var.user;
    const { email, role, expiresInDays } = c.req.valid("json");

    const guard = await requireRole(
      c,
      id,
      ["owner", "admin"],
      "招待権限がありません",
    );
    if (!guard.ok) return guard.res;

    const days = expiresInDays ?? 7;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    try {
      const invitation = await prisma.organizationInvitation.create({
        data: {
          organizationId: id,
          email,
          invitedBy: user.id,
          role: role ?? "member",
          expiresAt,
        },
      });
      return c.json(invitation, 201);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        // 同一組織 × 同一 email × 同一 status の重複招待
        return c.json(
          { error: "このメールアドレスへの招待は既に存在します" },
          409,
        );
      }
      throw e;
    }
  })
  .post("/:id/join", async (c) => {
    const id = c.req.param("id");
    const user = c.var.user;

    // 既に参加済みのユーザーが /join を叩いた場合は冪等ではなく 409 で
    // 「既に参加済み」を明示する（ロール上書き等の意図しない副作用を避ける）。
    const existing = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: { userId: user.id, organizationId: id },
      },
    });
    if (existing) {
      return c.json({ error: "既にこの組織に参加しています" }, 409);
    }

    // 招待検索 → status 更新 → membership 作成を一貫させる。
    // 期限切れ招待は status=pending のまま残るが now と比較してスキップする
    // （expired への自動遷移はバッチジョブ前提）。
    // 外側の existing チェックは高速パスとして残し、並列 /join による
    // membership 主キー (userId, organizationId) 重複は P2002 を捕捉して 409 にする。
    let result: { userId: string; organizationId: string; role: OrgRole } | null;
    try {
      result = await prisma.$transaction(async (tx) => {
        const invitation = await tx.organizationInvitation.findFirst({
          where: {
            organizationId: id,
            email: user.email,
            status: "pending",
            expiresAt: { gt: new Date() },
          },
        });
        if (!invitation) {
          return null;
        }

        await tx.organizationInvitation.update({
          where: { id: invitation.id },
          data: { status: "accepted" },
        });
        const membership = await tx.organizationMembership.create({
          data: {
            userId: user.id,
            organizationId: id,
            role: invitation.role,
          },
        });
        return membership;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        return c.json({ error: "既にこの組織に参加しています" }, 409);
      }
      throw e;
    }

    if (!result) {
      return c.json({ error: "有効な招待が見つかりません" }, 404);
    }
    return c.json(result);
  });
