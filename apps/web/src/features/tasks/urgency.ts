// タスクの緊急度判定とリマインド集計ロジック。
// ダッシュボードのタスクカード（routes/index.tsx）と集約バナーで共用するため、
// テスト可能な純関数として features/tasks 配下に切り出している。

import type { TaskListItem } from "./types";

const DAY_MS = 1000 * 60 * 60 * 24;

// 期限超過 / 今週期限 / それ以降 の 3 段階。
export type TaskUrgency = "overdue" | "this-week" | "later";

// 緊急度ごとの左フレーム色・期限テキスト色。
export const URGENCY_STYLE: Record<
  TaskUrgency,
  { border: string; deadline: string }
> = {
  overdue: {
    border: "border-l-destructive",
    deadline: "text-destructive font-medium",
  },
  "this-week": {
    border: "border-l-amber-500",
    deadline: "text-amber-600 font-medium",
  },
  later: {
    border: "border-l-slate-200",
    deadline: "text-muted-foreground",
  },
};

// 当日 0 時を返す。緊急度判定は時刻を切り捨てて「日」単位で比較する。
function startOfDay(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 期限日から緊急度を算出する。
// now を引数化してテストで固定できるようにしつつ、既定値で従来の呼び出しと互換を保つ。
export function calcUrgency(
  dueDate: string | null,
  now: Date = new Date(),
): TaskUrgency {
  if (!dueDate) return "later";
  const today = startOfDay(now);
  const due = new Date(dueDate);
  if (due < today) return "overdue";
  const weekLater = new Date(today);
  weekLater.setDate(weekLater.getDate() + 7);
  if (due <= weekLater) return "this-week";
  return "later";
}

// 期限の表示用文字列。超過時は「N日超過」、それ以外は「月/日」。
export function formatDeadline(
  dueDate: string | null,
  urgency: TaskUrgency,
  now: Date = new Date(),
): string {
  if (!dueDate) return "未設定";
  if (urgency === "overdue") {
    const today = startOfDay(now);
    const days = Math.ceil(
      (today.getTime() - new Date(dueDate).getTime()) / DAY_MS,
    );
    return `${days}日超過`;
  }
  const d = new Date(dueDate);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ダッシュボード上部のリマインド集約に表示する件数。
export type ReminderSummary = {
  // 期限超過（未完了タスクのうち期限が過ぎたもの）
  overdue: number;
  // 今週期限（this-week）
  dueSoon: number;
  // 着手予定日超過（開始予定日が過ぎているのに未着手 = status:todo のもの）
  startOverdue: number;
  // 未読（API が付与する unread フラグ）
  unread: number;
};

// 未完了タスク配列からリマインド件数を集計する。
// 1 タスクが複数条件に該当する場合は各カテゴリで重複してカウントする
// （ユーザーへの「見落とし防止」が目的のため、重複は許容する）。
export function summarizeReminders(
  tasks: TaskListItem[],
  now: Date = new Date(),
): ReminderSummary {
  const today = startOfDay(now);
  const summary: ReminderSummary = {
    overdue: 0,
    dueSoon: 0,
    startOverdue: 0,
    unread: 0,
  };
  for (const task of tasks) {
    const urgency = calcUrgency(task.dueDate, now);
    if (urgency === "overdue") summary.overdue += 1;
    else if (urgency === "this-week") summary.dueSoon += 1;
    // 着手予定日を過ぎてもまだ着手していない（todo のまま）タスクを抽出。
    // in_progress は着手済みのため対象外。
    if (
      task.startDate &&
      new Date(task.startDate) < today &&
      task.status === "todo"
    ) {
      summary.startOverdue += 1;
    }
    if (task.unread) summary.unread += 1;
  }
  return summary;
}
