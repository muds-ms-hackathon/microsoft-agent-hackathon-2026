import { cn } from "@/lib/utils";
import { useDroppable } from "@dnd-kit/core";
import type { ReactNode } from "react";
import { taskStatusLabels } from "../labels";
import type { TaskStatus } from "../types";

// Kanban の 1 列。useDroppable でドロップターゲットになり、status を id にする。
// ヘッダにラベルと件数を出し、子としてカード列を受け取る。
export function KanbanColumn({
  status,
  count,
  children,
}: {
  status: TaskStatus;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      aria-label={`${taskStatusLabels[status]} 列`}
      className="flex flex-col min-w-[16rem] flex-1"
      data-testid={`kanban-column-${status}`}
    >
      <header className="flex items-center justify-between px-2 py-1.5">
        <h3 className="text-sm font-semibold">{taskStatusLabels[status]}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-col gap-2 p-2 rounded-md min-h-[8rem] flex-1",
          "bg-muted/40 border border-transparent transition-colors",
          isOver && "border-foreground/40 bg-muted/70",
        )}
      >
        {children}
      </div>
    </section>
  );
}
