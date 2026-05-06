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
// description は省略時は未更新、空文字列で「説明をクリア」を意味する
// （DB 上は String? だが API 仕様としては null は受け付けず空文字で表現）。
const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  .strict()
  .refine((d) => d.name !== undefined || d.description !== undefined, {
    message: "更新する項目を 1 つ以上指定してください",
  });

// owner ロールの招待は不可（owner は組織作成者のみ）。
// expiresInDays は 1〜365 日。email はサーバ側で trim + 小文字化して保存・比較する。
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["admin", "member"]).optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

// 認証ユーザーが対象組織に所属していることを確認する。
// 所属していない場合は組織の存在自体を露出させないため 404 で統一する。
// 詳細閲覧 (GET /:id) のように「所属していれば誰でも可」のケースで使う。
async function requireMembership(
  c: Context<{ Variables: AuthVariables }>,
  organizationId: string,
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
  return { ok: true, membership };
}

// 所属確認に加えて、許容ロールに含まれているかを判定する。
// 所属していなければ 404、ロール不足なら 403。
async function requireRole(
  c: Context<{ Variables: AuthVariables }>,
  organizationId: string,
  allowed: OrgRole[],
  forbiddenMessage: string,
): Promise<
  | { ok: true; membership: OrganizationMembership }
  | { ok: false; res: Response }
> {
  const guard = await requireMembership(c, organizationId);
  if (!guard.ok) return guard;
  if (!allowed.includes(guard.membership.role)) {
    return {
      ok: false,
      res: c.json({ error: forbiddenMessage }, 403),
    };
  }
  return guard;
}

export const organizationsRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", auth)
  .get("/", async (c) => {
    const user = c.var.user;
    // 自分の membership の role を 1 件だけ include して取得し、
    // フロント側で「自分の role」をカード表示するために平坦化して返す。
    const orgs = await prisma.organization.findMany({
      where: { memberships: { some: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      include: {
        memberships: {
          where: { userId: user.id },
          select: { role: true },
        },
      },
    });
    const result = orgs.map(({ memberships, ...rest }) => ({
      ...rest,
      role: memberships[0]?.role ?? "member",
    }));
    return c.json(result);
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

    const guard = await requireMembership(c, id);
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
    // 削除済みリソースの本体を返しても利用側で扱いに困るため 204 で返す。
    await prisma.organization.delete({ where: { id } });
    return c.body(null, 204);
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

    // 招待先 email のユーザーが既にこの組織のメンバーである場合は、
    // 招待を作っても /join で 409 になるだけで pending 招待が腐る。
    // 招待作成時点で 409 を返し、無駄なレコードを残さない。
    // User.email は @unique なので findFirst でも実質一意。
    const existingMember = await prisma.organizationMembership.findFirst({
      where: {
        organizationId: id,
        user: { email },
      },
    });
    if (existingMember) {
      return c.json({ error: "このユーザーは既にこの組織のメンバーです" }, 409);
    }

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
    // 招待は invite 側で email を trim + 小文字化して保存しているため、
    // 認証ユーザーの email も同様に正規化してから照合する（IdP が大文字を
    // 含む email を返してもマッチさせるため）。
    const normalizedEmail = user.email.trim().toLowerCase();
    let result: {
      userId: string;
      organizationId: string;
      role: OrgRole;
    } | null;
    try {
      result = await prisma.$transaction(async (tx) => {
        const invitation = await tx.organizationInvitation.findFirst({
          where: {
            organizationId: id,
            email: normalizedEmail,
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
