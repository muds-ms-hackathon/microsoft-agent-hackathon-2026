import { z } from "zod";

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
