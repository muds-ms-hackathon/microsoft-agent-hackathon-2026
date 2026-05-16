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

// 定例のデフォルト所要時間（分）。1〜480 分（8 時間）を許容する。
// 480 分を上限とした理由: 半日以上の会議は MVP 想定外、フロントの表示崩れも防ぐため。
const defaultDurationMinutesSchema = z
  .number()
  .int()
  .min(1, "所要時間は 1 分以上で指定してください")
  .max(480, "所要時間は 480 分以下で指定してください");

export const recurringMeetingCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  scheduleCron: scheduleCronSchema,
  defaultDurationMinutes: defaultDurationMinutesSchema,
});

// 既存 organization の updateSchema と同じ流儀。
// 全フィールド未指定の空ボディは更新意図が不明瞭なため 400 で弾く。
export const recurringMeetingUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    scheduleCron: scheduleCronSchema.optional(),
    defaultDurationMinutes: defaultDurationMinutesSchema.optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.name !== undefined ||
      d.description !== undefined ||
      d.scheduleCron !== undefined ||
      d.defaultDurationMinutes !== undefined,
    { message: "更新する項目を 1 つ以上指定してください" },
  );
