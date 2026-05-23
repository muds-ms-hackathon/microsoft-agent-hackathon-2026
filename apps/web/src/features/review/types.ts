export type ReviewItemType =
  | "decision"
  | "open_issue"
  | "task_candidate"
  | "ambiguity";

// API の sourceTable に対応: どのDBテーブル由来かを示す
export type ReviewItemSourceTable = "decision_item" | "task" | "ambiguous_info";

// API の status 値に合わせた共用体型
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
  email: string;
};

export type ReviewItem = {
  id: string;
  // どのDBテーブル由来かを示す（PATCH エンドポイントの振り分けに使用）
  sourceTable: ReviewItemSourceTable;
  type: ReviewItemType;
  title: string;
  body: string | null;
  // DB の sourceQuote（根拠となる発話1文）と sourceContext（前後の文脈）に対応
  sourceQuote: string | null;
  sourceContext: string;
  status: ReviewItemStatus;
  assignees: ReviewAssignee[];
  // ISO 8601 datetime または null
  deadline: string | null;
  // ambiguity のみ使用（DB の ambiguous_infos.severity に対応）
  severity: AmbiguitySeverity | null;
  recurringMeetingId: string;
  meetingId: string;
  // 楽観ロック用バージョン番号
  version: number;
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
