import { cn } from "@/lib/utils";
import { useDraggable } from "@dnd-kit/core";
import type { TaskListItem } from "../types";
import { AvatarStack } from "./AvatarStack";

function isOverdue(task: TaskListItem, now: Date): boolean {
  if (!task.dueDate) return false;
  if (task.status === "done" || task.status === "rejected") return false;
  return new Date(task.dueDate) < now;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Kanban のカード。TaskRow より小さく、列内で複数並ぶ前提の軽量な見た目にする。
// useDraggable で DnD 対象にし、軽いクリックではドラッグを誤発火させない activation を採用。
// 表示: タイトル / 期日（あれば）/ 担当者アバター（最大 3）
export function KanbanCard({
  task,
  onClick,
  now,
}: {
  task: TaskListItem;
  onClick?: () => void;
  now?: Date;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });

  const overdue = isOverdue(task, now ?? new Date());

  return (
    // button 要素を使うことで biome の useSemanticElements に従う。
    // 子は inline 要素 (span) で構成し、HTML 仕様で button 内に許される表現に限定する。
    <button
      type="button"
      ref={setNodeRef}
      style={{
        // useDraggable の transform は { x, y } を返す。translate3d で適用する。
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        // ドラッグ中は他のカード上に浮くようにする。
        zIndex: isDragging ? 50 : undefined,
      }}
      {...attributes}
      {...listeners}
      onClick={onClick}
      aria-label={`タスク ${task.title}`}
      data-testid="kanban-card"
      className={cn(
        "rounded-md border border-border/50 bg-card p-3 text-left",
        "flex flex-col gap-2 text-sm shadow-sm w-full",
        isDragging ? "opacity-60" : "hover:bg-accent",
        onClick !== undefined ? "cursor-pointer" : "cursor-default",
      )}
    >
      <span className="font-medium truncate">{task.title}</span>
      <span className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-xs tabular-nums",
            overdue ? "text-destructive font-medium" : "text-muted-foreground",
          )}
        >
          {task.dueDate ? `期日 ${formatShortDate(task.dueDate)}` : "—"}
        </span>
        <AvatarStack users={task.assignees} max={3} />
      </span>
    </button>
  );
}
