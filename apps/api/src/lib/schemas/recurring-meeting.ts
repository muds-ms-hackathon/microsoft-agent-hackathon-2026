import { z } from "zod";

// scheduleCron は MVP 段階では「スペース区切り 5 フィールド」の形式のみ検証する。
// 各フィールドの妥当性（分・時・日・月・曜日の範囲）は後続 Issue で
// cron パーサー導入時に厳格化する予定。
const cronFieldFormat = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/;
const scheduleCronSchema = z
  .string()
  .min(1)
  .regex(
    cronFieldFormat,
    "scheduleCron は 5 フィールドの cron 形式で指定してください",
  );

export const recurringMeetingCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  scheduleCron: scheduleCronSchema,
});

// 既存 organization の updateSchema と同じ流儀。
// 全フィールド未指定の空ボディは更新意図が不明瞭なため 400 で弾く。
export const recurringMeetingUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    scheduleCron: scheduleCronSchema.optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.name !== undefined ||
      d.description !== undefined ||
      d.scheduleCron !== undefined,
    { message: "更新する項目を 1 つ以上指定してください" },
  );
