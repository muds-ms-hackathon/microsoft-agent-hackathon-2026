import { z } from "zod";

// TopicRequest の優先度。Prisma enum TopicRequestPriority と合わせる。
const topicRequestPrioritySchema = z.enum(["required", "optional"]);

// 作成リクエスト。title は必須、body / priority は任意。
// 認可は呼び出し元（meeting に対する membership 確認）で行うため、ここでは meetingId・requestedBy を含めない。
export const topicRequestCreateSchema = z.object({
  title: z.string().min(1, "title は必須です"),
  body: z.string().optional(),
  priority: topicRequestPrioritySchema.optional(),
});

// 更新リクエスト。全フィールド任意だが、最低 1 つは指定する。
// priority は null で「未指定に戻す」を許容する。body も null で「空に戻す」を許容。
export const topicRequestUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    body: z.string().nullable().optional(),
    priority: topicRequestPrioritySchema.nullable().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.title !== undefined || d.body !== undefined || d.priority !== undefined,
    { message: "更新する項目を 1 つ以上指定してください" },
  );

export type TopicRequestCreateInput = z.infer<typeof topicRequestCreateSchema>;
export type TopicRequestUpdateInput = z.infer<typeof topicRequestUpdateSchema>;
