import { api, authHeaders } from "@/lib/api";
import {
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { taskQueryKeys } from "../queryKeys";
import type { ManualTaskStatus, TaskListItem } from "../types";
import { TaskVersionConflictError } from "./useUpdateTask";

// Kanban の DnD 起点でステータスを更新する mutation。
// 一覧キャッシュを setQueryData で即座に書き換える楽観的更新を実装し、
// 失敗時は onError で rollback、成功時は onSettled で invalidate して
// 正しい version を取り直す（次回更新の整合性確保）。
//
// queryKey は呼び出し元（KanbanBoard を使うページ）から渡してもらう。
// useMyTasks や useRecurringMeetingTasks 等が使うキャッシュキーと一致させる必要がある。
export function useKanbanStatusUpdate(queryKey: QueryKey) {
  const queryClient = useQueryClient();

  return useMutation<
    unknown,
    Error,
    { taskId: string; version: number; status: ManualTaskStatus },
    // onMutate が返すコンテキスト型
    { prev: TaskListItem[] | undefined }
  >({
    mutationFn: async ({ taskId, version, status }) => {
      const res = await api.tasks[":id"].$patch(
        { param: { id: taskId }, json: { version, status } },
        authHeaders(),
      );
      if (res.status === 409) {
        throw new TaskVersionConflictError();
      }
      if (!res.ok) {
        throw new Error(`Failed to update task status: ${res.status}`);
      }
      return res.json();
    },
    onMutate: async ({ taskId, status }) => {
      // 進行中のフェッチをキャンセルして上書きされないようにする。
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<TaskListItem[]>(queryKey);
      // 即座に新 status に書き換え。drop でカードが新列に移動する見た目を維持する。
      queryClient.setQueryData<TaskListItem[]>(queryKey, (old) =>
        old?.map((t) => (t.id === taskId ? { ...t, status } : t)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      // rollback。失敗時はカードが元の列に戻る。
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(queryKey, ctx.prev);
      }
    },
    onSettled: () => {
      // 成功/失敗どちらでも、一覧と詳細の両方を再フェッチして整合性を取り直す。
      // 楽観的に書き換えた status は最新の version で再取得しないとロストアップデートになる。
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.all });
    },
  });
}
