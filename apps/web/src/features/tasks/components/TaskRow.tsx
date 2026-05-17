import { cn } from "@/lib/utils";
import { taskStatusLabels } from "../labels";
import type { TaskListItem } from "../types";

// 期限が過ぎていて未完了かどうかを判定する。
// dueDate が null の場合は超過扱いにしない。
// 比較は now を引数で差し込めるようにして、テストで固定時刻が使えるようにする。
function isOverdue(task: TaskListItem, now: Date): boolean {
  if (!task.dueDate) return false;
  if (task.status === "done" || task.status === "rejected") return false;
  return new Date(task.dueDate) < now;
}

// 日付 (YYYY-MM-DD) として整形する。
function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
}

// タスク一覧の 1 行コンポーネント。My タスク・定例詳細・会議詳細で共通利用する。
// onClick 未指定時はホバー強調も無効化（ダイアログ Issue #169 完成前の暫定挙動）。
export function TaskRow({
  task,
  onClick,
  now,
}: {
  task: TaskListItem;
  onClick?: () => void;
  // テストで固定時刻を注入するための差し込み。本番は new Date() を使う。
  now?: Date;
}) {
  const overdue = isOverdue(task, now ?? new Date());
  const clickable = onClick !== undefined;

  return (
    <li>
      <button
        type="button"
        // 行クリックがなければハイライト・cursor を抑え、視覚的に「未対応」を示す。
        onClick={onClick}
        disabled={!clickable}
        aria-label={`タスク ${task.title}`}
        className={cn(
          "w-full text-left px-4 py-3 rounded-md border border-border/50 bg-card",
          "grid grid-cols-[1fr_auto_auto_auto] items-center gap-3",
          clickable && "hover:bg-accent transition-colors cursor-pointer",
          !clickable && "cursor-default",
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{task.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            <span>{task.organization.name}</span>
            {task.recurringMeetings.length > 0 && (
              <>
                <span className="mx-1">/</span>
                <span>
                  {task.recurringMeetings[0].name}
                  {task.recurringMeetings.length > 1 &&
                    ` +${task.recurringMeetings.length - 1}`}
                </span>
              </>
            )}
          </p>
        </div>
        <span
          data-testid="task-status-badge"
          title={`ステータス: ${taskStatusLabels[task.status]}`}
          className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground"
        >
          {taskStatusLabels[task.status]}
        </span>
        <span
          data-testid="task-due-date"
          title={task.dueDate ? `期限 ${formatDate(task.dueDate)}` : "期限なし"}
          className={cn(
            "text-xs tabular-nums",
            overdue ? "text-destructive font-medium" : "text-muted-foreground",
          )}
        >
          {task.dueDate ? formatDate(task.dueDate) : "—"}
        </span>
        <span
          data-testid="task-assignee-count"
          title={`担当者 ${task.assignees.length} 名`}
          className="text-xs text-muted-foreground tabular-nums"
        >
          {task.assignees.length}名
        </span>
      </button>
    </li>
  );
}
