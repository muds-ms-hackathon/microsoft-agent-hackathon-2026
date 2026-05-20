export type ReviewItemType =
  | "decision"
  | "open_issue"
  | "task_candidate"
  | "ambiguity";

export type ReviewItemStatus = "pending" | "confirmed" | "held" | "rejected";

export type AmbiguitySeverity = "high" | "medium" | "low";

export type ReviewItem = {
  id: string;
  type: ReviewItemType;
  content: string;
  // DB の sourceQuote（根拠となる発話1文）と sourceContext（前後の文脈）に対応
  sourceQuote: string | null;
  sourceContext: string;
  status: ReviewItemStatus;
  assigneeIds: string[];
  deadline: string | null;
  // AI が提案した元の値（差分表示用）
  aiProposedDeadline: string | null;
  // ambiguity のみ使用（DB の ambiguous_infos.severity に対応）
  severity: AmbiguitySeverity | null;
  recurringMeetingId: string;
  recurringMeetingName: string;
  meetingId: string;
  meetingLabel: string;
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

// 決定事項は確定済みのため、レビュー操作の対象は残り3種別
export const REVIEWABLE_TYPES: ReviewItemType[] = [
  "open_issue",
  "task_candidate",
  "ambiguity",
];
