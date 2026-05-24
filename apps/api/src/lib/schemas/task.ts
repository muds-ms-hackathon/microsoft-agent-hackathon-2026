import { z } from "zod";

// 手動経路で受け付ける status 値（draft / reviewing は AI 専用なので除外）。
// POST では指定不可（サーバ側で todo 固定）、PATCH でのみ変更可能。
const manualTaskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "done",
  "rejected",
]);

const taskPrioritySchema = z.enum(["required", "optional"]);

// ID 配列は重複を排除する。zod 側で dedupe しておけば、
// 中間テーブル ユニーク制約での P2002 を待たずに整合できる。
const idArraySchema = z
  .array(z.string().min(1))
  .transform((arr) => [...new Set(arr)]);

// 共通の入力可能フィールド（POST/PATCH で共有）。
// AI 由来 (sourceQuote / dueDateRaw / ambiguityFlags 等) や decisionItemId は受け付けない。
// assigneeUserIds / recurringMeetingIds は省略・null のいずれも「未指定」として扱い、
// ハンドラ側で `?? []` に丸めて空配列扱いにする。JSON では undefined を表現できない
// ため、クライアントが「未指定」を null で送る慣習に合わせる。
const taskInputBaseSchema = z.object({
  title: z.string().min(1, "title は必須です"),
  body: z.string().optional(),
  priority: taskPrioritySchema.optional(),
  assigneeUserIds: idArraySchema.nullable().optional(),
  recurringMeetingIds: idArraySchema.nullable().optional(),
  originMeetingId: z.string().min(1).optional(),
  dueDate: z
    .string()
    .datetime({ message: "dueDate は ISO8601 で指定してください" })
    .optional(),
  startDate: z
    .string()
    .datetime({ message: "startDate は ISO8601 で指定してください" })
    .optional(),
  followUpDate: z
    .string()
    .datetime({ message: "followUpDate は ISO8601 で指定してください" })
    .optional(),
});

// 作成リクエスト。組織は必須。status は受け付けず、サーバが todo 固定で書き込む。
export const taskCreateSchema = taskInputBaseSchema.extend({
  organizationId: z.string().min(1, "organizationId は必須です"),
});

// 更新リクエスト。全フィールド optional だが、version は必須で楽観的ロックに用いる。
// 何も指定しない更新は意図不明瞭なため 400 で弾く。
// assigneeUserIds / recurringMeetingIds: undefined = 変更なし、空配列 = 全削除。
export const taskUpdateSchema = z
  .object({
    version: z.number().int().nonnegative(),
    title: z.string().min(1).optional(),
    body: z.string().optional(),
    status: manualTaskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    assigneeUserIds: idArraySchema.optional(),
    recurringMeetingIds: idArraySchema.optional(),
    originMeetingId: z.string().min(1).nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    startDate: z.string().datetime().nullable().optional(),
    followUpDate: z.string().datetime().nullable().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.title !== undefined ||
      d.body !== undefined ||
      d.status !== undefined ||
      d.priority !== undefined ||
      d.assigneeUserIds !== undefined ||
      d.recurringMeetingIds !== undefined ||
      d.originMeetingId !== undefined ||
      d.dueDate !== undefined ||
      d.startDate !== undefined ||
      d.followUpDate !== undefined,
    { message: "更新する項目を 1 つ以上指定してください" },
  );

export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

// 一覧 API 共通のクエリパラメータ。
// status: カンマ区切りで複数指定可（例: ?status=todo,in_progress）
// assigneeId / dueBefore / dueAfter: 単一値
const taskStatusValuesSchema = z
  .string()
  .transform((s) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  )
  .pipe(
    z.array(
      z.enum(["draft", "reviewing", "todo", "in_progress", "done", "rejected"]),
    ),
  );

export const taskListQuerySchema = z.object({
  status: taskStatusValuesSchema.optional(),
  // assigneeId は通常 userId（任意の非空文字列）だが、特殊値 "none" を許容する。
  // "none" は「未アサインのタスクだけ」を意味するセンチネルで、where 構築時に
  // `assignees: { none: {} }` に展開される。
  assigneeId: z.string().min(1).optional(),
  dueBefore: z
    .string()
    .datetime({ message: "dueBefore は ISO8601 で指定してください" })
    .optional(),
  dueAfter: z
    .string()
    .datetime({ message: "dueAfter は ISO8601 で指定してください" })
    .optional(),
  // 「期限超過のみ」クイックトグル用。"true" の完全一致だけを真と扱い、
  // それ以外の文字列（未指定含む）は false にする（z.coerce.boolean だと
  // "false" や任意文字列も true になってしまうため避ける）。
  overdueOnly: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

// buildTaskListWhere の戻り値型。overdueOnly と既存 status filter の併用時に
// AND を使うため、AND 配列も含めて型を明示する。
type TaskStatusWhere = {
  in?: TaskListQuery["status"];
  notIn?: Array<"draft" | "reviewing" | "done" | "rejected">;
};
type TaskListWhere = {
  status?: TaskStatusWhere;
  // 通常は some（指定 userId のタスク）、"none" センチネルでは none（未アサインのみ）。
  assignees?: { some: { userId: string } } | { none: Record<string, never> };
  dueDate?: { gte?: Date; lte?: Date; lt?: Date };
  AND?: Array<{ status: TaskStatusWhere }>;
};

// 一覧 API のクエリフィルタを Prisma の where 句に変換する。
// スコープ別の where 条件（例: organizationId 等）と AND 合成する想定。
// now はテストでの注入を許すために引数化しているが、本番ではデフォルトのリクエスト時刻を使う。
export function buildTaskListWhere(
  filters: TaskListQuery,
  now: Date = new Date(),
): TaskListWhere {
  const where: TaskListWhere = {};
  const userProvidedStatus = !!(filters.status && filters.status.length > 0);
  if (userProvidedStatus) {
    where.status = { in: filters.status };
  }
  if (filters.assigneeId === "none") {
    // 「未アサインのみ」絞り込み。任意の assignee を持つタスクを除外する。
    where.assignees = { none: {} };
  } else if (filters.assigneeId) {
    where.assignees = { some: { userId: filters.assigneeId } };
  }
  if (filters.dueBefore || filters.dueAfter) {
    where.dueDate = {};
    if (filters.dueAfter) where.dueDate.gte = new Date(filters.dueAfter);
    if (filters.dueBefore) where.dueDate.lte = new Date(filters.dueBefore);
  }
  // overdueOnly: 「期限超過 かつ 未完了」に絞る。
  // - dueDate.lt = now（dueBefore があれば lte と共存させる）
  // - status は「done/rejected を外す」が、ユーザーの status filter と両立させるため
  //   ユーザー指定がある場合のみ AND で結合する（Prisma は同一フィールドの上書きになるため）。
  if (filters.overdueOnly === true) {
    where.dueDate = { ...(where.dueDate ?? {}), lt: now };
    if (userProvidedStatus) {
      where.AND = [
        { status: where.status },
        { status: { notIn: ["done", "rejected"] } },
      ];
      delete where.status;
    } else {
      // draft/reviewing（AI抽出中）+ done/rejected（完了）を一括除外
      where.status = { notIn: ["draft", "reviewing", "done", "rejected"] };
    }
  } else if (!userProvidedStatus) {
    // draft/reviewing は AI 抽出中のタスク候補のため、タスク一覧には表示しない
    where.status = { notIn: ["draft", "reviewing"] };
  }
  return where;
}
