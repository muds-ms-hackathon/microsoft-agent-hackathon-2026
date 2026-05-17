import type { OrganizationMembership, OrgRole } from "@prisma/client";
import type { Context } from "hono";
import { prisma } from "../lib/prisma.js";
import type { AuthVariables } from "./auth.js";

// 認可ガード共通モジュール。
// 「認証ユーザーが対象組織に所属しているか」「許可ロールに含まれるか」を
// 単一の真実源として集約する。`organizations.ts` / `tasks.ts` /
// `recurring-meetings.ts` で重複していた実装を本モジュールで一本化する。

type Guard<T> =
  | { ok: true; membership: T }
  | { ok: false; res: Response };

// 認証ユーザーが対象組織に所属していることを確認する。
// 所属していない場合は組織の存在自体を露出させないため 404 で統一する。
export async function requireOrgMembership(
  c: Context<{ Variables: AuthVariables }>,
  organizationId: string,
): Promise<Guard<OrganizationMembership>> {
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

// 所属確認 + 許容ロールチェック。所属なし→404、ロール不足→403。
// 403 のメッセージは呼び出し側が文脈に応じて与える。
export async function requireOrgRole(
  c: Context<{ Variables: AuthVariables }>,
  organizationId: string,
  allowed: OrgRole[],
  forbiddenMessage: string,
): Promise<Guard<OrganizationMembership>> {
  const guard = await requireOrgMembership(c, organizationId);
  if (!guard.ok) return guard;
  if (!allowed.includes(guard.membership.role)) {
    return {
      ok: false,
      res: c.json({ error: forbiddenMessage }, 403),
    };
  }
  return guard;
}
