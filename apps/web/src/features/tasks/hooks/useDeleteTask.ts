import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { taskQueryKeys } from "../queryKeys";

// タスク削除 mutation。成功時は detail と一覧をまとめて invalidate。
// 削除済み task の detail が再 fetch されると 404 になるが、これは UI 側で
// 「タスクが見つかりません」表示に倒す前提（呼び出し側でナビゲーション等を行う）。
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (taskId) => {
      const res = await api.tasks[":id"].$delete(
        { param: { id: taskId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to delete task: ${res.status}`);
      }
    },
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.all });
    },
  });
}
