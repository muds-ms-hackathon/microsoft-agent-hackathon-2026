import { DeleteTaskDialog } from "@/features/tasks/components/DeleteTaskDialog";
import { EditTaskDialog } from "@/features/tasks/components/EditTaskDialog";
import { KanbanCard } from "@/features/tasks/components/KanbanCard";
import { KanbanColumn } from "@/features/tasks/components/KanbanColumn";
import { useKanbanStatusUpdate } from "@/features/tasks/hooks/useKanbanStatusUpdate";
import { useTaskDialogState } from "@/features/tasks/hooks/useTaskDialogState";
import { TaskVersionConflictError } from "@/features/tasks/hooks/useUpdateTask";
import type { ManualTaskStatus, TaskListItem } from "@/features/tasks/types";
import {
  DndContext,
  type DragEndEvent,
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
  queryKey,
  ariaLabel,
  now,
}: {
  tasks: TaskListItem[];
  queryKey: QueryKey;
  ariaLabel: string;
  now?: Date;
}) {
  const statusUpdate = useKanbanStatusUpdate(queryKey);
  const [dndError, setDndError] = useState<string | null>(null);
  const {
    task,
    isError,
    deleteOpen,
    detailQuery,
    select,
    openDelete,
    setDeleteOpen,
    closeAll,
  } = useTaskDialogState();

  // PointerSensor の activationConstraint で短いクリックは drag を発火させない。
  // distance: 5 で十分（タスクカードのクリック=編集と区別）。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // 列ごとにタスクを振り分け。手動 4 status 以外は無視（AI 専用は将来別 UI）。
  const byStatus = new Map<ManualTaskStatus, TaskListItem[]>(
    KANBAN_COLUMNS.map((s) => [s, []]),
  );
  for (const t of tasks) {
    if (isManualStatus(t.status)) byStatus.get(t.status)?.push(t);
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return; // 列外にドロップした場合は何もしない
    const taskId = String(active.id);
    const dropStatus = String(over.id);
    if (!isManualStatus(dropStatus)) return;

    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    if (target.status === dropStatus) return; // 同じ列に戻したケースは no-op

    setDndError(null);
    statusUpdate.mutate(
      { taskId, version: target.version, status: dropStatus },
      {
        onError: (err) => {
          // 409 とそれ以外でメッセージを区別する。useKanbanStatusUpdate 側で rollback 済み。
          if (err instanceof TaskVersionConflictError) {
            setDndError(
              "他のユーザーが先に更新しました。最新を取得して再試行してください。",
            );
          } else {
            setDndError("ステータスの更新に失敗しました");
          }
        },
      },
    );
  };

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
                      onClick={() => select(t.id)}
                    />
                  ))
                )}
              </KanbanColumn>
            );
          })}
        </div>
      </DndContext>

      {/* DnD によるステータス更新エラーの inline 表示。
          rollback は楽観的更新側で処理済みなので、表示するメッセージだけここで管理。 */}
      {dndError !== null && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-center justify-between gap-2 mt-3"
        >
          <span className="text-destructive">{dndError}</span>
          <button
            type="button"
            onClick={() => setDndError(null)}
            className="text-xs px-2 py-1 rounded-md border border-destructive/40 hover:bg-destructive/10"
          >
            閉じる
          </button>
        </div>
      )}

      {/* TaskListWithDialogs と同じ詳細取得 → 編集ダイアログ → 削除ダイアログの動線。
          state machine は useTaskDialogState で共通化済み。 */}
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
          onRequestDelete={openDelete}
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
