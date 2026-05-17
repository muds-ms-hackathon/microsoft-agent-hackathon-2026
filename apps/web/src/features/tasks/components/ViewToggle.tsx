import { cn } from "@/lib/utils";
import { KanbanSquareIcon, ListIcon } from "lucide-react";

export type TaskView = "list" | "kanban";

// List / Kanban のビュー切替トグル。URL クエリの同期は親が担う。
// 視覚的にはセグメント化コントロール（押されたボタンが強調される）。
export function ViewToggle({
  view,
  onChange,
}: {
  view: TaskView;
  onChange: (next: TaskView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="表示モード切替"
      className="inline-flex rounded-md border border-border/60 bg-card overflow-hidden"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === "list"}
        onClick={() => onChange("list")}
        className={cn(
          "flex items-center gap-1 px-3 py-1.5 text-xs",
          view === "list"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-accent",
        )}
      >
        <ListIcon size={13} />
        List
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === "kanban"}
        onClick={() => onChange("kanban")}
        className={cn(
          "flex items-center gap-1 px-3 py-1.5 text-xs",
          view === "kanban"
            ? "bg-foreground text-background"
            : "text-muted-foreground hover:bg-accent",
        )}
      >
        <KanbanSquareIcon size={13} />
        Kanban
      </button>
    </div>
  );
}
