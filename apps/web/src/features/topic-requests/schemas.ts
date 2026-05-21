import { z } from "zod";

// API 側 (apps/api/src/lib/schemas/topic-request.ts) のバリデーションと整合する。
// クライアントでも先にチェックして無駄な往復を避ける。
const priorityFormSchema = z.enum(["required", "optional"]);

// 作成フォーム。priority は未指定（null）も許容するため、フォーム側では
// "unset" センチネルを採用し、送信時に undefined へ変換する。
export const createTopicRequestFormSchema = z.object({
  title: z.string().min(1, "タイトルは必須です"),
  body: z.string().optional(),
  priority: z.union([priorityFormSchema, z.literal("unset")]).optional(),
});

export type CreateTopicRequestFormInput = z.infer<
  typeof createTopicRequestFormSchema
>;

// 編集フォーム。最低 1 項目の指定を refine で要求する。
// priority は null で「未指定にクリア」を許容する。
export const updateTopicRequestFormSchema = z
  .object({
    title: z.string().min(1, "タイトルは必須です").optional(),
    body: z.string().nullable().optional(),
    priority: priorityFormSchema.nullable().optional(),
  })
  .refine(
    (d) =>
      d.title !== undefined || d.body !== undefined || d.priority !== undefined,
    { message: "更新する項目を 1 つ以上指定してください" },
  );

export type UpdateTopicRequestFormInput = z.infer<
  typeof updateTopicRequestFormSchema
>;
