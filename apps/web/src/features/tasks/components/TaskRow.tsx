import { cn } from "@/lib/utils";
import { taskStatusLabels } from "../labels";
import type { TaskListItem } from "../types";
import { AvatarStack } from "./AvatarStack";

// 期限が過ぎていて未完了かどうかを判定する。
// dueDate が null の場合は超過扱いにしない。
// 比較は now を引数で差し込めるようにして、テストで固定時刻が使えるようにする。
function isOverdue(task: TaskListItem, now: Date): boolean {
  if (!task.dueDate) return false;
  if (task.status === "done" || task.status === "rejected") return false;
  return new Date(task.dueDate) < now;
}

// 行内の日付は短縮表記 "M/D" にして横幅を抑える。
// 年跨ぎは MVP では年なしのまま（少数派のため）。本格運用で必要なら拡張する。
function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// タスク一覧の 1 行コンポーネント。My タスク・定例詳細・会議詳細で共通利用する。
// 2 行構造で「タイトル + status」「組織 + 定例タグ」「日付 + 担当者アバター」の
// 3 ブロックで情報を密に提示する。
// onClick 未指定時はホバー強調も無効化（ダイアログ未接続時の暫定挙動）。
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

  // 日付ラベル: 着手 と 期日 を中点で連結。両方なしのときは "—"。
  const dateParts: string[] = [];
  if (task.startDate) dateParts.push(`着手 ${formatShortDate(task.startDate)}`);
  if (task.dueDate) dateParts.push(`期日 ${formatShortDate(task.dueDate)}`);

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={!clickable}
        aria-label={`タスク ${task.title}`}
        className={cn(
          "w-full text-left p-4 rounded-md border border-border/50 bg-card flex flex-col gap-2",
          clickable && "hover:bg-accent transition-colors cursor-pointer",
          !clickable && "cursor-default",
        )}
      >
        {/* Row 1: タイトル + ステータスバッジ */}
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium truncate min-w-0 flex-1">
            {task.title}
          </p>
          <span
            data-testid="task-status-badge"
            title={`ステータス: ${taskStatusLabels[task.status]}`}
            className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground shrink-0"
          >
            {taskStatusLabels[task.status]}
          </span>
        </div>

        {/* Row 2: 組織 + 定例タグ群（全列挙、折り返し可） */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium">{task.organization.name}</span>
          {task.recurringMeetings.length > 0 && (
            <>
              <span className="opacity-40">·</span>
              {task.recurringMeetings.map((rm) => (
                <span
                  key={rm.id}
                  className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground"
                  data-testid="task-recurring-tag"
                >
                  {rm.name}
                </span>
              ))}
            </>
          )}
        </div>

        {/* Row 3: 日付 + 担当者アバター */}
        <div className="flex items-center justify-between gap-3">
          <span
            data-testid="task-dates"
            className={cn(
              "text-xs tabular-nums",
              overdue
                ? "text-destructive font-medium"
                : "text-muted-foreground",
            )}
          >
            {dateParts.length > 0 ? dateParts.join(" · ") : "—"}
          </span>
          <AvatarStack users={task.assignees} max={4} />
        </div>
      </button>
    </li>
  );
}
