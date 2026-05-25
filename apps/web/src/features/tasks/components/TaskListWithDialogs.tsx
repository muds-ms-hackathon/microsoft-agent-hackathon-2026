import { DeleteTaskDialog } from "@/features/tasks/components/DeleteTaskDialog";
import { EditTaskDialog } from "@/features/tasks/components/EditTaskDialog";
import { TaskRow } from "@/features/tasks/components/TaskRow";
import { useTaskDialogState } from "@/features/tasks/hooks/useTaskDialogState";
import type { TaskListItem } from "@/features/tasks/types";

// タスク一覧の行クリック → 編集ダイアログ → 削除ダイアログまで一気通貫で扱う共通ラッパー。
// 各ページ（My タスク・定例詳細・会議詳細）で重複する「行クリック state + useTaskDetail
// + EditTaskDialog + DeleteTaskDialog の連動」を useTaskDialogState で共通化している。
export function TaskListWithDialogs({
  tasks,
  ariaLabel,
  now,
}: {
  tasks: TaskListItem[];
  ariaLabel: string;
  now?: Date;
}) {
  const {
    task,
    isLoading,
    isError,
    deleteOpen,
    detailQuery,
    select,
    openDelete,
    setDeleteOpen,
    closeAll,
  } = useTaskDialogState();

  return (
    <>
      <ul aria-label={ariaLabel} className="grid gap-2">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} now={now} onClick={() => select(t.id)} />
        ))}
      </ul>

      {/* 詳細取得失敗のインラインアラート。toast UI 未導入のため簡素表示 + 再試行。 */}
      {isError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-center justify-between gap-2"
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

      {/* 取得中はダイアログを開かず、UI を阻害しないよう軽い表示のみ。 */}
      {isLoading && (
        <p className="text-xs text-muted-foreground" role="status">
          タスク詳細を読み込み中...
        </p>
      )}

      {/* 詳細取得成功時のみ EditTaskDialog を mount する。
          mount/unmount で RHF の defaultValues が常に最新 task で初期化される。 */}
      {task !== null && (
        <EditTaskDialog
          task={task}
          open={!deleteOpen}
          onOpenChange={(next) => {
            // Edit が閉じられたら全状態をリセット（次の行クリックを受けられる状態に戻す）。
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
            // 削除ダイアログを「キャンセル」で閉じた場合は Edit に戻る。
            // onDeleted で閉じる場合は closeAll が走り Edit ごと閉じる。
          }}
          onDeleted={closeAll}
        />
      )}
    </>
  );
}
