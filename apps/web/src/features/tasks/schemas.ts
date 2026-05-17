import { z } from "zod";

// API 側 (apps/api/src/lib/schemas/task.ts) のバリデーションと整合する。
// クライアント側でも先にチェックして、無駄な往復を防ぐ。

const isoDatetime = z
  .string()
  .datetime({ message: "日時は ISO8601 形式で指定してください" });

const manualTaskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "done",
  "rejected",
]);

const taskPrioritySchema = z.enum(["required", "optional"]);

// 作成フォームのスキーマ。
// status はサーバ側で todo 固定のため受け付けない。
export const createTaskFormSchema = z.object({
  organizationId: z.string().min(1, "組織は必須です"),
  title: z.string().min(1, "タイトルは必須です"),
  body: z.string().optional(),
  priority: taskPrioritySchema.optional(),
  assigneeUserIds: z.array(z.string().min(1)).optional(),
  recurringMeetingIds: z.array(z.string().min(1)).optional(),
  originMeetingId: z.string().min(1).optional(),
  dueDate: isoDatetime.optional(),
  startDate: isoDatetime.optional(),
  followUpDate: isoDatetime.optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskFormSchema>;

// 更新フォームのスキーマ。
// version は楽観的ロックに必須。全フィールド未指定の更新は API 側で 400 になるため
// refine で先に弾く。assigneeUserIds / recurringMeetingIds は undefined = 変更なし、
// 空配列 = 全削除のセマンティクス。
export const updateTaskFormSchema = z
  .object({
    version: z.number().int().nonnegative(),
    title: z.string().min(1).optional(),
    body: z.string().optional(),
    status: manualTaskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    assigneeUserIds: z.array(z.string().min(1)).optional(),
    recurringMeetingIds: z.array(z.string().min(1)).optional(),
    originMeetingId: z.string().min(1).nullable().optional(),
    dueDate: isoDatetime.nullable().optional(),
    startDate: isoDatetime.nullable().optional(),
    followUpDate: isoDatetime.nullable().optional(),
  })
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

export type UpdateTaskInput = z.infer<typeof updateTaskFormSchema>;
