import { DeleteTaskDialog } from "@/features/tasks/components/DeleteTaskDialog";
import { EditTaskDialog } from "@/features/tasks/components/EditTaskDialog";
import { KanbanCard } from "@/features/tasks/components/KanbanCard";
import { KanbanColumn } from "@/features/tasks/components/KanbanColumn";
import { useTaskDetail } from "@/features/tasks/hooks/useTaskDetail";
import type { ManualTaskStatus, TaskListItem } from "@/features/tasks/types";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { QueryKey } from "@tanstack/react-query";
import { useState } from "react";

// 手動経路で扱う 4 列（draft / reviewing は AI 専用なのでカンバンには出さない）。
const KANBAN_COLUMNS: ManualTaskStatus[] = [
  "todo",
  "in_progress",
  "done",
  "rejected",
];

// 手動経路の status かを絞り込む。draft / reviewing は表示対象から除外する。
function isManualStatus(status: string): status is ManualTaskStatus {
  return (
    status === "todo" ||
    status === "in_progress" ||
    status === "done" ||
    status === "rejected"
  );
}

// Kanban ビュー。タスクを status 列で並べ、DnD でステータスを変更する。
// queryKey は楽観的更新の対象キャッシュを特定するために使う（呼び出し元と一致させる）。
export function KanbanBoard({
  tasks,
  queryKey: _queryKey, // 楽観的更新で使う。本 commit では未使用
  ariaLabel,
  now,
}: {
  tasks: TaskListItem[];
  queryKey: QueryKey;
  ariaLabel: string;
  now?: Date;
}) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const detailQuery = useTaskDetail(selectedTaskId);
  const task = detailQuery.data ?? null;
  const isError = selectedTaskId !== null && detailQuery.isError;

  // PointerSensor の activationConstraint で短いクリックは drag を発火させない。
  // distance: 5 で十分（タスクカードのクリック=編集と区別）。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const closeAll = () => {
    setDeleteOpen(false);
    setSelectedTaskId(null);
  };

  // 列ごとにタスクを振り分け。手動 4 status 以外は無視（AI 専用は将来別 UI）。
  const byStatus = new Map<ManualTaskStatus, TaskListItem[]>(
    KANBAN_COLUMNS.map((s) => [s, []]),
  );
  for (const t of tasks) {
    if (isManualStatus(t.status)) byStatus.get(t.status)?.push(t);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        // 本 commit ではドロップで何もしない（次 commit で楽観的更新を入れる）。
        onDragEnd={() => {}}
      >
        {/* biome-ignore lint/a11y/useSemanticElements: 4 列のレイアウトコンテナで role=group をつけて aria-label を有効化 */}
        <div
          role="group"
          aria-label={ariaLabel}
          data-testid="kanban-board"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {KANBAN_COLUMNS.map((status) => {
            const items = byStatus.get(status) ?? [];
            return (
              <KanbanColumn key={status} status={status} count={items.length}>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1">
                    タスクなし
                  </p>
                ) : (
                  items.map((t) => (
                    <KanbanCard
                      key={t.id}
                      task={t}
                      now={now}
                      onClick={() => setSelectedTaskId(t.id)}
                    />
                  ))
                )}
              </KanbanColumn>
            );
          })}
        </div>
      </DndContext>

      {/* TaskListWithDialogs と同じ詳細取得 → 編集ダイアログ → 削除ダイアログの動線。
          重複は将来 useTaskDialogState 等で共通化する余地あり。 */}
      {isError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-center justify-between gap-2 mt-3"
        >
          <span className="text-destructive">
            タスク詳細の取得に失敗しました
          </span>
          <button
            type="button"
            onClick={() => detailQuery.refetch()}
            className="text-xs px-2 py-1 rounded-md border border-destructive/40 hover:bg-destructive/10"
          >
            再試行
          </button>
        </div>
      )}

      {task !== null && (
        <EditTaskDialog
          task={task}
          open={!deleteOpen}
          onOpenChange={(next) => {
            if (!next && !deleteOpen) closeAll();
          }}
          onRequestDelete={() => setDeleteOpen(true)}
        />
      )}

      {task !== null && (
        <DeleteTaskDialog
          task={task}
          open={deleteOpen}
          onOpenChange={(next) => {
            setDeleteOpen(next);
          }}
          onDeleted={closeAll}
        />
      )}
    </>
  );
}
