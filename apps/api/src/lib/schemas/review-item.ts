import type { Prisma } from "@prisma/client";
import { z } from "zod";

const idArraySchema = z
  .array(z.string().min(1))
  .transform((arr) => [...new Set(arr)]);

const reviewItemTypeValues = [
  "decision",
  "open_issue",
  "task_candidate",
  "ambiguity",
] as const;

const commaSeparatedTypes = z
  .string()
  .transform((s) =>
    s
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.enum(reviewItemTypeValues)));

export const reviewItemQuerySchema = z.object({
  type: commaSeparatedTypes.optional(),
});

export const recurringMeetingReviewItemQuerySchema =
  reviewItemQuerySchema.extend({
    meetingId: z.string().min(1).optional(),
  });

export const decisionItemPatchSchema = z
  .object({
    version: z.number().int().nonnegative(),
    status: z
      .enum(["draft", "reviewing", "open", "decided", "cancelled"])
      .optional(),
    decisionState: z
      .enum(["confirmed", "tentative", "open"])
      .nullable()
      .optional(),
    title: z.string().min(1).optional(),
    body: z.string().nullable().optional(),
    assigneeUserIds: idArraySchema.optional(),
    decisionDeadline: z.string().datetime().nullable().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.status !== undefined ||
      d.decisionState !== undefined ||
      d.title !== undefined ||
      d.body !== undefined ||
      d.assigneeUserIds !== undefined ||
      d.decisionDeadline !== undefined,
    { message: "更新する項目を 1 つ以上指定してください" },
  );

export const ambiguousInfoPatchSchema = z
  .object({
    version: z.number().int().nonnegative(),
    status: z.enum(["rejected"]).optional(),
    resolutionType: z.enum(["task", "decision_item", "discarded"]).optional(),
    newTask: z
      .object({
        title: z.string().min(1).optional(),
        body: z.string().optional(),
        assigneeUserIds: idArraySchema.optional(),
        recurringMeetingIds: idArraySchema.optional(),
        dueDate: z.string().datetime().nullable().optional(),
      })
      .optional(),
    newDecisionItem: z
      .object({
        title: z.string().min(1).optional(),
        body: z.string().optional(),
      })
      .optional(),
  })
  .strict()
  .refine((d) => d.status !== undefined || d.resolutionType !== undefined, {
    message: "status または resolutionType を指定してください",
  });

// POST /meetings/:id/review-items（動作確認用・後で削除予定）
// ambiguity は AmbiguousInfo.body に title を格納するため body フィールドを持たない。
const baseCreateFields = {
  title: z.string().min(1),
  sourceContext: z.string().optional(),
};
export const reviewItemCreateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("decision"),
    ...baseCreateFields,
    body: z.string().optional(),
  }),
  z.object({
    type: z.literal("open_issue"),
    ...baseCreateFields,
    body: z.string().optional(),
  }),
  z.object({
    type: z.literal("task_candidate"),
    ...baseCreateFields,
    body: z.string().optional(),
  }),
  z.object({ type: z.literal("ambiguity"), ...baseCreateFields }),
]);

export type ReviewItemQuery = z.infer<typeof reviewItemQuerySchema>;
export type RecurringMeetingReviewItemQuery = z.infer<
  typeof recurringMeetingReviewItemQuerySchema
>;
export type DecisionItemPatchInput = z.infer<typeof decisionItemPatchSchema>;
export type AmbiguousInfoPatchInput = z.infer<typeof ambiguousInfoPatchSchema>;
export type ReviewItemCreateInput = z.infer<typeof reviewItemCreateSchema>;

export function buildReviewItemTypeFilter(typeFilter: ReviewItemQuery["type"]) {
  const includeDecision =
    !typeFilter ||
    typeFilter.includes("decision") ||
    typeFilter.includes("open_issue");
  const includeTasks = !typeFilter || typeFilter.includes("task_candidate");
  const includeAmbiguousInfos = !typeFilter || typeFilter.includes("ambiguity");

  // open_issue は decisionState が "open" または null（AI 未設定）のため OR が必要。
  let decisionItemTypeWhere: Pick<
    Prisma.DecisionItemWhereInput,
    "decisionState" | "OR"
  > = {};
  if (typeFilter) {
    const wantDecision = typeFilter.includes("decision");
    const wantOpenIssue = typeFilter.includes("open_issue");
    if (wantDecision && !wantOpenIssue) {
      decisionItemTypeWhere = {
        decisionState: { in: ["confirmed", "tentative"] },
      };
    } else if (!wantDecision && wantOpenIssue) {
      decisionItemTypeWhere = {
        OR: [{ decisionState: "open" }, { decisionState: null }],
      };
    }
  }

  return {
    includeDecision,
    includeTasks,
    includeAmbiguousInfos,
    decisionItemTypeWhere,
  };
}
