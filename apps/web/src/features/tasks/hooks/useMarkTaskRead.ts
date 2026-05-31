import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { taskQueryKeys } from "../queryKeys";

// タスクを既読化する mutation（POST /tasks/:id/read）。
// 未読フラグは /tasks/me が付与するため、成功時に tasks スコープ全体を
// invalidate して未読表示を最新化する。
export function useMarkTaskRead() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (taskId) => {
      const res = await api.tasks[":id"].read.$post(
        { param: { id: taskId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to mark task read: ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.all });
    },
  });
}
