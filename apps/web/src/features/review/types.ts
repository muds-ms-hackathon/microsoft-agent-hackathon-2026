export type ReviewItemType =
  | "decision"
  | "open_issue"
  | "task_candidate"
  | "ambiguity";

export type ReviewItemSourceTable = "decision_item" | "task" | "ambiguous_info";

export type ReviewItemStatus =
  | "draft"
  | "reviewing"
  | "open"
  | "decided"
  | "cancelled"
  | "rejected";

export type AmbiguitySeverity = "high" | "medium" | "low";

export type ReviewAssignee = {
  id: string;
  name: string;
  displayName: string;
  email: string | null;
};

export type AmbiguityResolutionType = "task" | "decision_item" | "discarded";

export type ReviewItem = {
  id: string;
  // PATCH エンドポイントの振り分けに使用
  sourceTable: ReviewItemSourceTable;
  type: ReviewItemType;
  title: string;
  body: string | null;
  sourceQuote: string | null;
  sourceContext: string | null;
  status: ReviewItemStatus;
  assignees: ReviewAssignee[];
  // ISO 8601 datetime または null
  deadline: string | null;
  // ambiguity のみ使用（DB の ambiguous_infos.severity に対応）
  severity: AmbiguitySeverity | null;
  // ambiguity のみ使用（解消方法: task / decision_item / discarded）
  resolutionType: AmbiguityResolutionType | null;
  recurringMeetingId: string;
  recurringMeetingName: string;
  meetingId: string;
  // 楽観ロック用バージョン番号
  version: number;
  // task_candidate のみ。in_progress/done は draft への遷移が API で禁止されるため canReset 判定に使う
  taskStatus?: string | null;
};

export const TYPE_LABELS: Record<ReviewItemType, string> = {
  decision: "決定事項",
  open_issue: "未決事項",
  task_candidate: "タスク候補",
  ambiguity: "曖昧箇所",
};

export const TYPE_BADGE_CLASS: Record<ReviewItemType, string> = {
  decision: "bg-blue-100 text-blue-700",
  open_issue: "bg-yellow-100 text-yellow-700",
  task_candidate: "bg-green-100 text-green-700",
  ambiguity: "bg-red-100 text-red-700",
};

// AI が抽出する全種別（アコーディオン表示などで使う）
export const REVIEW_ITEM_TYPES: ReviewItemType[] = [
  "decision",
  "open_issue",
  "task_candidate",
  "ambiguity",
];

export const REVIEWABLE_TYPES: ReviewItemType[] = [
  "decision",
  "open_issue",
  "task_candidate",
  "ambiguity",
];
