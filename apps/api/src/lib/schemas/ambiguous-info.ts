import { z } from "zod";

// 手動で変更可能なステータス値。draft / reviewing は AI 専用なので除外する。
const manualAmbiguousInfoStatusSchema = z.enum(["resolved", "rejected"]);

// 更新リクエスト。全フィールド optional だが、version は必須で楽観的ロックに用いる。
// resolvedToTaskId / resolvedToDecisionItemId は同一会議内のアイテムのみ許可する。
export const ambiguousInfoUpdateSchema = z
  .object({
    version: z.number().int().nonnegative(),
    status: manualAmbiguousInfoStatusSchema.optional(),
    resolutionType: z
      .enum(["task", "decision_item", "discarded"])
      .nullable()
      .optional(),
    resolvedToTaskId: z.string().min(1).nullable().optional(),
    resolvedToDecisionItemId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.status !== undefined ||
      d.resolutionType !== undefined ||
      d.resolvedToTaskId !== undefined ||
      d.resolvedToDecisionItemId !== undefined,
    { message: "更新する項目を 1 つ以上指定してください" },
  )
  // resolutionType と解消先 ID の種別が矛盾しないことを保証する。
  // resolutionType=task        → resolvedToTaskId のみ許可
  // resolutionType=decision_item → resolvedToDecisionItemId のみ許可
  // resolutionType=discarded   → 解消先 ID は両方 null/未指定
  .refine(
    (d) => {
      if (d.resolutionType === "task" && d.resolvedToDecisionItemId) {
        return false;
      }
      if (d.resolutionType === "decision_item" && d.resolvedToTaskId) {
        return false;
      }
      if (
        d.resolutionType === "discarded" &&
        (d.resolvedToTaskId || d.resolvedToDecisionItemId)
      ) {
        return false;
      }
      return true;
    },
    { message: "resolutionType と解消先 ID の種別が一致していません" },
  );

export type AmbiguousInfoUpdateInput = z.infer<
  typeof ambiguousInfoUpdateSchema
>;

// 一覧 API のクエリパラメータ。status はカンマ区切りで複数指定可。
const ambiguousInfoStatusValuesSchema = z
  .string()
  .transform((s) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.enum(["draft", "reviewing", "resolved", "rejected"])));

export const ambiguousInfoListQuerySchema = z.object({
  status: ambiguousInfoStatusValuesSchema.optional(),
});

export type AmbiguousInfoListQuery = z.infer<
  typeof ambiguousInfoListQuerySchema
>;

type AmbiguousInfoListWhere = {
  status?: {
    in: Array<"draft" | "reviewing" | "resolved" | "rejected">;
  };
};

export function buildAmbiguousInfoListWhere(
  filters: AmbiguousInfoListQuery,
): AmbiguousInfoListWhere {
  const where: AmbiguousInfoListWhere = {};
  if (filters.status && filters.status.length > 0) {
    where.status = { in: filters.status };
  }
  return where;
}
