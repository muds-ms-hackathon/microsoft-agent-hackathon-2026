import { zValidator } from "@hono/zod-validator";
import { type OrgRole, Prisma } from "@prisma/client";
import { Hono } from "hono";
import { z } from "zod";
import { normalizeEmail } from "../lib/email.js";
import { prisma } from "../lib/prisma.js";
import { recurringMeetingCreateSchema } from "../lib/schemas/recurring-meeting.js";
import {
  buildReviewItemTypeFilter,
  reviewItemQuerySchema,
} from "../lib/schemas/review-item.js";
import {
  buildTaskListWhere,
  taskListQuerySchema,
} from "../lib/schemas/task.js";
import {
  serializeTask,
  taskListInclude,
  taskListOrderBy,
} from "../lib/task-serialization.js";
import {
  ambiguousInfoReviewInclude,
  decisionItemReviewInclude,
  serializeReviewItems,
  taskReviewInclude,
} from "../lib/review-item-serialization.js";
import { auth, type AuthVariables } from "../middleware/auth.js";
import { requireOrgMembership, requireOrgRole } from "../middleware/authz.js";

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

// ダッシュボードの「次回会議」表示用に、組織配下の定例の会議のうち
// heldAt が現在以降のものを最大 limit 件取得する。limit は無制限を許すと
// 一覧 API と区別が付かなくなるため必須 + 1〜50 で制限する。
const nextMeetingsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50),
});

// owner ロールの招待は不可（owner は組織作成者のみ）。
// expiresInDays は 1〜365 日。email は lib/email.ts の normalizeEmail で
// 正規化（trim + 小文字化）した上で保存・比較する。
// role / expiresInDays は省略・null のいずれも「未指定」として扱い、
// ハンドラ側で role="member" / 7 日のデフォルトにフォールバックする。
// JSON では undefined を表現できないため、クライアントが null で送る慣習に合わせる。
const inviteSchema = z.object({
  email: z.string().transform(normalizeEmail).pipe(z.string().email()),
  role: z.enum(["admin", "member"]).nullable().optional(),
  expiresInDays: z.number().int().positive().max(365).nullable().optional(),
});

// 認可ガードは `middleware/authz.ts` に集約済み。
// 旧 requireMembership / requireRole はそちらの requireOrgMembership /
// requireOrgRole に統合した。

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
    // where と include の双方を `userId: user.id` で絞っているため、
    // 取得した各 organization には必ず 1 件以上 memberships が含まれる。
    // 取れない場合は DB 整合性が壊れているか、include 句の不一致のいずれかで、
    // "member" にサイレント・フォールバックすると不正データを隠してしまうため
    // 例外を投げて顕在化させる。
    const result = orgs.map(({ memberships, ...rest }) => {
      const role = memberships[0]?.role;
      if (!role) {
        throw new Error(
          `Membership not found for organization ${rest.id} / user ${user.id}`,
        );
      }
      return { ...rest, role };
    });
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

    const guard = await requireOrgMembership(c, id);
    if (!guard.ok) return guard.res;

    // 自分の role はガードで確定済みのものを流用し、追加クエリを避ける。
    // 定例一覧は組織詳細画面の簡易表示用に併せて返す（並び順は作成日時降順）。
    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        recurringMeetings: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!org) {
      return c.json({ error: "組織が見つかりません" }, 404);
    }
    return c.json({ ...org, role: guard.membership.role });
  })
  .get("/:id/members", async (c) => {
    const id = c.req.param("id");

    const guard = await requireOrgMembership(c, id);
    if (!guard.ok) return guard.res;

    // OrgRole enum を DB 側で owner→admin→member 順に並べる手段がないため
    // findMany では並べず、レスポンス整形時にメモリ内ソートする。
    const memberships = await prisma.organizationMembership.findMany({
      where: { organizationId: id },
      include: { user: true },
    });

    const roleOrder: Record<OrgRole, number> = {
      owner: 0,
      admin: 1,
      member: 2,
    };
    const sorted = [...memberships].sort((a, b) => {
      if (a.role !== b.role) return roleOrder[a.role] - roleOrder[b.role];
      return a.joinedAt.getTime() - b.joinedAt.getTime();
    });

    const result = sorted.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      displayName: m.user.displayName,
      email: m.user.email,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
    return c.json(result);
  })
  .delete("/:id/members/:userId", async (c) => {
    const id = c.req.param("id");
    const targetUserId = c.req.param("userId");
    const callerUserId = c.var.user.id;

    const guard = await requireOrgRole(
      c,
      id,
      ["owner"],
      "メンバー削除権限がありません",
    );
    if (!guard.ok) return guard.res;

    // 自己削除は #125（退会）の責務として本エンドポイントでは拒否する。
    if (callerUserId === targetUserId) {
      return c.json({ error: "自分自身を削除することはできません" }, 400);
    }

    // 削除対象 membership の存在を事前確認し、無ければ 404。
    // delete 時の P2025 を catch する方法もあるが、可読性優先で事前 findUnique を採る。
    const target = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId: id,
        },
      },
    });
    if (!target) {
      return c.json({ error: "対象メンバーが見つかりません" }, 404);
    }

    // MeetingMember は schema 側で onDelete: Cascade のため連鎖削除される。
    await prisma.organizationMembership.delete({
      where: {
        userId_organizationId: {
          userId: targetUserId,
          organizationId: id,
        },
      },
    });
    return c.body(null, 204);
  })
  .patch("/:id", zValidator("json", updateSchema), async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const guard = await requireOrgRole(
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

    const guard = await requireOrgRole(
      c,
      id,
      ["owner"],
      "削除権限がありません",
    );
    if (!guard.ok) return guard.res;

    // schema 側で Membership / Invitation / RecurringMeeting / MeetingMember は
    // onDelete: Cascade のため delete 一発で連鎖削除される。
    // 削除済みリソースの本体を返しても利用側で扱いに困るため 204 で返す。
    await prisma.organization.delete({ where: { id } });
    return c.body(null, 204);
  })
  .get("/:id/tasks", zValidator("query", taskListQuerySchema), async (c) => {
    const id = c.req.param("id");
    const filters = c.req.valid("query");

    const guard = await requireOrgMembership(c, id);
    if (!guard.ok) return guard.res;

    // 組織配下の全タスクをフィルタしつつ返す。フィルタは buildTaskListWhere で
    // 共通生成し、ここでは organizationId スコープを追加するだけ。
    const tasks = await prisma.task.findMany({
      where: {
        ...buildTaskListWhere(filters),
        organizationId: id,
      },
      orderBy: taskListOrderBy,
      include: taskListInclude,
    });
    return c.json(tasks.map(serializeTask));
  })
  .get("/:id/meetings", async (c) => {
    const id = c.req.param("id");

    const guard = await requireOrgMembership(c, id);
    if (!guard.ok) return guard.res;

    // 一覧画面でメンバー数バッジを出せるよう _count.members を併せて取得する。
    // メンバー詳細は重いので別エンドポイント（GET /recurring-meetings/:id）で返す。
    const meetings = await prisma.recurringMeeting.findMany({
      where: { organizationId: id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true } } },
    });
    return c.json(meetings);
  })
  .get(
    "/:id/next-meetings",
    zValidator("query", nextMeetingsQuerySchema),
    async (c) => {
      const id = c.req.param("id");
      const { limit } = c.req.valid("query");

      const guard = await requireOrgMembership(c, id);
      if (!guard.ok) return guard.res;

      // ダッシュボード「次回会議」セクションの N+1 解消のため、
      // 組織配下の全定例を横断して heldAt 昇順で limit 件を 1 クエリで取得する。
      // 単発会議（recurringMeetingId が null）は関係フィルタで自然に除外される。
      const now = new Date();
      const meetings = await prisma.meeting.findMany({
        where: {
          recurringMeeting: { organizationId: id },
          heldAt: { gte: now },
        },
        orderBy: { heldAt: "asc" },
        take: limit,
        select: {
          id: true,
          title: true,
          heldAt: true,
          estimatedDurationMinutes: true,
          recurringMeetingId: true,
          recurringMeeting: { select: { name: true } },
        },
      });

      // クライアント側で扱いやすいよう recurringMeeting.name を平坦化する。
      const result = meetings.map(({ recurringMeeting, ...m }) => ({
        ...m,
        recurringMeetingName: recurringMeeting?.name ?? null,
      }));
      return c.json(result);
    },
  )
  .post(
    "/:id/meetings",
    zValidator("json", recurringMeetingCreateSchema),
    async (c) => {
      const id = c.req.param("id");
      const user = c.var.user;
      const { name, description, scheduleCron, defaultDurationMinutes } =
        c.req.valid("json");

      const guard = await requireOrgMembership(c, id);
      if (!guard.ok) return guard.res;

      // RecurringMeeting 作成と作成者を MeetingMember.owner として登録する処理は
      // 整合性確保のため $transaction で原子的に実行する。
      const meeting = await prisma.$transaction(async (tx) => {
        const created = await tx.recurringMeeting.create({
          data: {
            organizationId: id,
            name,
            description,
            scheduleCron,
            defaultDurationMinutes,
          },
        });
        await tx.meetingMember.create({
          data: {
            recurringMeetingId: created.id,
            userId: user.id,
            role: "owner",
          },
        });
        return created;
      });

      return c.json(meeting, 201);
    },
  )
  .get("/:id/invitations", async (c) => {
    const id = c.req.param("id");

    const guard = await requireOrgRole(
      c,
      id,
      ["owner", "admin"],
      "招待管理権限がありません",
    );
    if (!guard.ok) return guard.res;

    // status=pending のみ取得し、期限切れ判定はレスポンス側の expired フィールドで返す。
    // expired→DB 値の自動遷移はバッチジョブ前提のため、ここでは status を変更しない。
    const invitations = await prisma.organizationInvitation.findMany({
      where: { organizationId: id, status: "pending" },
      orderBy: { createdAt: "desc" },
      include: {
        inviter: {
          select: { id: true, name: true, displayName: true, email: true },
        },
      },
    });

    const now = new Date();
    const result = invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      expired: inv.expiresAt <= now,
      inviter: inv.inviter,
    }));
    return c.json(result);
  })
  .delete("/:id/invitations/:invitationId", async (c) => {
    const id = c.req.param("id");
    const invitationId = c.req.param("invitationId");

    const guard = await requireOrgRole(
      c,
      id,
      ["owner", "admin"],
      "招待管理権限がありません",
    );
    if (!guard.ok) return guard.res;

    const invitation = await prisma.organizationInvitation.findUnique({
      where: { id: invitationId },
    });

    // 404 条件:
    //   - 招待が存在しない
    //   - 招待が path で指定された別組織のもの（横断アクセス防止）
    if (!invitation || invitation.organizationId !== id) {
      return c.json({ error: "招待が見つかりません" }, 404);
    }

    // 既に accepted ⇒ メンバーは既に組織に居るため取消不可。409 で明示する。
    if (invitation.status === "accepted") {
      return c.json({ error: "既に受諾済みの招待は取消できません" }, 409);
    }

    // 既に revoked ⇒ 冪等として 204 を返す。expired は revoke を許す
    //（owner/admin が「期限切れ招待を整理する」意図を尊重）。
    if (invitation.status === "revoked") {
      return c.body(null, 204);
    }

    await prisma.organizationInvitation.update({
      where: { id: invitationId },
      data: { status: "revoked" },
    });
    return c.body(null, 204);
  })
  .post("/:id/invite", zValidator("json", inviteSchema), async (c) => {
    const id = c.req.param("id");
    const user = c.var.user;
    const { email, role, expiresInDays } = c.req.valid("json");

    const guard = await requireOrgRole(
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
    // 招待 (invite 側) と user.email (auth ミドルウェア側) の双方が保存前に
    // trim + 小文字化されている前提で raw 比較する。
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
  })
  .get(
    "/:id/review-items",
    zValidator("query", reviewItemQuerySchema),
    async (c) => {
      const id = c.req.param("id");
      const filters = c.req.valid("query");

      const guard = await requireOrgMembership(c, id);
      if (!guard.ok) return guard.res;

      const {
        includeDecision,
        includeTasks,
        includeAmbiguousInfos,
        decisionItemTypeWhere,
      } = buildReviewItemTypeFilter(filters.type);

      const orgWhere = {
        meeting: { recurringMeeting: { organizationId: id } },
      };

      const [decisionItems, tasks, ambiguousInfos] = await Promise.all([
        includeDecision
          ? prisma.decisionItem.findMany({
              where: { ...orgWhere, ...decisionItemTypeWhere },
              orderBy: { createdAt: "asc" },
              include: decisionItemReviewInclude,
            })
          : [],
        includeTasks
          ? prisma.task.findMany({
              where: {
                originMeeting: { recurringMeeting: { organizationId: id } },
              },
              orderBy: { createdAt: "asc" },
              include: taskReviewInclude,
            })
          : [],
        includeAmbiguousInfos
          ? prisma.ambiguousInfo.findMany({
              where: orgWhere,
              orderBy: { createdAt: "asc" },
              include: ambiguousInfoReviewInclude,
            })
          : [],
      ]);

      return c.json(
        serializeReviewItems({ decisionItems, tasks, ambiguousInfos }),
      );
    },
  );
