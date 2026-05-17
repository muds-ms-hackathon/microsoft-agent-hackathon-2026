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
const taskInputBaseSchema = z.object({
  title: z.string().min(1, "title は必須です"),
  body: z.string().optional(),
  priority: taskPrioritySchema.optional(),
  assigneeUserIds: idArraySchema.optional(),
  recurringMeetingIds: idArraySchema.optional(),
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
