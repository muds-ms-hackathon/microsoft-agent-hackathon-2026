import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { taskQueryKeys } from "../queryKeys";
import type { CreateTaskInput } from "../schemas";
import type { Task } from "../types";

// タスク作成 mutation。
// 成功時は ["tasks"] 配下を一括 invalidate して、各画面の一覧をリフレッシュさせる。
// 詳細は新規作成時にはまだキャッシュに無いため invalidate 対象外。
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation<Task, Error, CreateTaskInput>({
    mutationFn: async (input) => {
      const res = await api.tasks.$post({ json: input }, authHeaders());
      if (!res.ok) {
        throw new Error(`Failed to create task: ${res.status}`);
      }
      return (await res.json()) as Task;
    },
    onSuccess: () => {
      // 一覧系（me/org/recurring/meeting）と将来追加される関連クエリをまとめて invalidate。
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.all });
    },
  });
}
