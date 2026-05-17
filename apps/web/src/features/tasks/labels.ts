import type {
  AmbiguityType,
  ResolutionType,
  TaskPriority,
  TaskStatus,
} from "./types";

// タスクのステータスの日本語ラベル。
// draft / reviewing は AI 抽出直後の状態で、UI 上では「AI 提案」「レビュー中」と表示する。
export const taskStatusLabels: Record<TaskStatus, string> = {
  draft: "AI 提案",
  reviewing: "レビュー中",
  todo: "未着手",
  in_progress: "進行中",
  done: "完了",
  rejected: "却下",
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  required: "必須",
  optional: "任意",
};

// 曖昧情報の種別。AI 根拠表示や notice バッジで利用する。
export const ambiguityTypeLabels: Record<AmbiguityType, string> = {
  missing_speaker: "話者欠落",
  transcription_error_low: "軽微な誤認識",
  transcription_error_high: "重度の誤認識",
  no_assignee: "担当者未指定",
  no_deadline_mentioned: "期限の言及なし",
  no_deadline_absolute: "期限が相対表現のみ",
  unclear_decision: "決定状態が不明確",
  insufficient_basis: "根拠不十分",
  unclear_scope: "スコープが不明確",
};

export const resolutionTypeLabels: Record<ResolutionType, string> = {
  task: "タスク化",
  decision_item: "未決事項化",
  discarded: "破棄",
};
