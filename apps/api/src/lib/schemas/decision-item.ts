import { z } from "zod";

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
