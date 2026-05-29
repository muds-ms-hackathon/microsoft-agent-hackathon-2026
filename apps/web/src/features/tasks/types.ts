// タスク機能のフロント側型定義。
// API レスポンスとの整合を取りつつ、AI 由来フィールド (read-only) を独立した型として
// 分類することで、UI 側で「ユーザーが入力できる範囲」と「AI が埋める範囲」を区別しやすくする。

// API enum と一致。手動編集では draft / reviewing は使わない。
export type TaskStatus =
  | "draft"
  | "reviewing"
  | "todo"
  | "in_progress"
  | "done"
  | "rejected";

// 手動編集で選択可能なステータスのみ（draft / reviewing は AI 専用）。
export type ManualTaskStatus = Exclude<TaskStatus, "draft" | "reviewing">;

export type TaskPriority = "required" | "optional";

export type AmbiguityType =
  | "missing_speaker"
  | "transcription_error_low"
  | "transcription_error_high"
  | "no_assignee"
  | "no_deadline_mentioned"
  | "no_deadline_absolute"
  | "unclear_decision"
  | "insufficient_basis"
  | "unclear_scope";

export type ResolutionType = "task" | "decision_item" | "discarded";

// 担当者ユーザーの最小情報。一覧では email を含めない。
export type AssigneeUser = {
  id: string;
  name: string;
  displayName: string;
  email?: string;
};

// AI 由来の read-only フィールド群。手動経路では入力受付なし。
// UI 側で「AI 根拠の表示セクション」をまとめて描画するためのドキュメント的グルーピング。
export type TaskAiDerivedFields = {
  sourceQuote: string | null;
  sourceContext: string | null;
  dueDateRaw: string | null;
  dueDateEstimated: boolean | null;
  assigneeRaw: string | null;
  blockingItemId: string | null;
  carriedOverCount: number | null;
  ambiguityFlags: AmbiguityType[] | null;
  progressNote: string | null;
};

// ユーザーが編集可能な共通フィールド。
export type TaskEditableFields = {
  title: string;
  body: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  dueDate: string | null;
  startDate: string | null;
  followUpDate: string | null;
};

// 一覧 API のレスポンス 1 行分。Email を含まない軽量プロフィールが付く。
export type TaskListItem = TaskEditableFields &
  TaskAiDerivedFields & {
    id: string;
    organizationId: string;
    originMeetingId: string | null;
    decisionItemId: string | null;
    version: number;
    createdAt: string;
    updatedAt: string;
    organization: { id: string; name: string };
    originMeeting: {
      id: string;
      title: string;
      heldAt: string;
      recurringMeetingId: string | null;
    } | null;
    assignees: AssigneeUser[];
    recurringMeetings: Array<{ id: string; name: string }>;
  };

// 詳細 API のレスポンス。assignees に email が含まれる以外は一覧と同形。
export type Task = Omit<TaskListItem, "assignees"> & {
  assignees: Array<AssigneeUser & { email: string | null }>;
};

// 一覧 API の共通フィルタ。
export type TaskListFilters = {
  status?: TaskStatus[];
  assigneeId?: string;
  dueBefore?: string;
  dueAfter?: string;
  // 「期限超過のみ」クイックトグル。true のとき API 側で
  // dueDate < now AND status NOT IN (done, rejected) で絞り込む。
  overdueOnly?: boolean;
};
