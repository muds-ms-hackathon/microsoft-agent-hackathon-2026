import { z } from "zod";

// 手動で変更可能なステータス値。draft / reviewing は AI 専用なので除外する。
const manualDecisionItemStatusSchema = z.enum(["open", "decided", "cancelled"]);

// ID 配列は重複を排除する。
const idArraySchema = z
  .array(z.string().min(1))
  .transform((arr) => [...new Set(arr)]);

// 更新リクエスト。全フィールド optional だが、version は必須で楽観的ロックに用いる。
// assigneeUserIds: undefined = 変更なし、空配列 = 全削除。
export const decisionItemUpdateSchema = z
  .object({
    version: z.number().int().nonnegative(),
    title: z.string().min(1).optional(),
    body: z.string().optional(),
    status: manualDecisionItemStatusSchema.optional(),
    decisionState: z
      .enum(["confirmed", "tentative", "open"])
      .nullable()
      .optional(),
    reason: z
      .enum([
        "no_consensus",
        "information_lack",
        "intentional_defer",
        "not_discussed",
      ])
      .nullable()
      .optional(),
    decisionDeadline: z.string().datetime().nullable().optional(),
    assigneeUserIds: idArraySchema.optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.title !== undefined ||
      d.body !== undefined ||
      d.status !== undefined ||
      d.decisionState !== undefined ||
      d.reason !== undefined ||
      d.decisionDeadline !== undefined ||
      d.assigneeUserIds !== undefined,
    { message: "更新する項目を 1 つ以上指定してください" },
  );

export type DecisionItemUpdateInput = z.infer<typeof decisionItemUpdateSchema>;

// 一覧 API のクエリパラメータ。status はカンマ区切りで複数指定可。
const decisionItemStatusValuesSchema = z
  .string()
  .transform((s) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  )
  .pipe(
    z.array(z.enum(["draft", "reviewing", "open", "decided", "cancelled"])),
  );

export const decisionItemListQuerySchema = z.object({
  status: decisionItemStatusValuesSchema.optional(),
});

export type DecisionItemListQuery = z.infer<typeof decisionItemListQuerySchema>;

type DecisionItemListWhere = {
  status?: {
    in: Array<"draft" | "reviewing" | "open" | "decided" | "cancelled">;
  };
};

export function buildDecisionItemListWhere(
  filters: DecisionItemListQuery,
): DecisionItemListWhere {
  const where: DecisionItemListWhere = {};
  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }
  return where;
}
