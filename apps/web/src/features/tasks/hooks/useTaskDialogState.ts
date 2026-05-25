import { useTaskDetail } from "@/features/tasks/hooks/useTaskDetail";
import { useState } from "react";

/**
 * 行クリック → 詳細取得 → 編集ダイアログ → 削除ダイアログまでの state machine を共通化する hook。
 *
 * TaskListWithDialogs と KanbanBoard で重複していたロジックを集約する。
 *
 * 戻り値:
 * - selectedTaskId: 選択中のタスク ID（未選択時は null）
 * - task: useTaskDetail で取得した詳細データ
 * - isLoading: 詳細取得中フラグ（selectedTaskId 非 null かつ loading 時のみ true）
 * - isError: 詳細取得失敗フラグ
 * - deleteOpen: 削除ダイアログ表示中フラグ
 * - detailQuery: 元の useTaskDetail の戻り値（refetch 用）
 * - select: タスクを選択する（行クリックハンドラから呼ぶ）
 * - openDelete: 削除ダイアログを開く
 * - setDeleteOpen: 削除ダイアログの open 状態を更新する（onOpenChange 用）
 * - closeAll: 全状態をリセット（選択解除＋削除ダイアログクローズ）
 */
export function useTaskDialogState() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // taskId が null の時は useTaskDetail 側で enabled:false になり fetch されない。
  const detailQuery = useTaskDetail(selectedTaskId);
  const task = detailQuery.data ?? null;
  const isLoading = selectedTaskId !== null && detailQuery.isLoading;
  const isError = selectedTaskId !== null && detailQuery.isError;

  const select = (taskId: string) => setSelectedTaskId(taskId);
  const openDelete = () => setDeleteOpen(true);
  const closeAll = () => {
    setDeleteOpen(false);
    setSelectedTaskId(null);
  };

  return {
    selectedTaskId,
    task,
    isLoading,
    isError,
    deleteOpen,
    detailQuery,
    select,
    openDelete,
    setDeleteOpen,
    closeAll,
  };
}
