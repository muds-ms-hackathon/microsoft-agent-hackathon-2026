import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { taskQueryKeys } from "../queryKeys";
import type { UpdateTaskInput } from "../schemas";
import type { Task } from "../types";

// 楽観的ロック競合（PATCH 409）を呼び出し側で識別できるようにする専用エラー型。
// メッセージに依存させず instanceof で判定する。
export class TaskVersionConflictError extends Error {
  constructor() {
    super("他のユーザーが先に更新しました。最新を取得してください");
    this.name = "TaskVersionConflictError";
  }
}

// タスク更新 mutation。
// 成功時は当該タスクの detail と ["tasks"] 配下の一覧を invalidate。
// 409 は TaskVersionConflictError を throw し、UI 側で「再取得して再試行」を促す。
export function useUpdateTask(taskId: string) {
  const queryClient = useQueryClient();

  return useMutation<Task, Error, UpdateTaskInput>({
    mutationFn: async (input) => {
      const res = await api.tasks[":id"].$patch(
        { param: { id: taskId }, json: input },
        authHeaders(),
      );
      if (res.status === 409) {
        throw new TaskVersionConflictError();
      }
      if (!res.ok) {
        throw new Error(`Failed to update task: ${res.status}`);
      }
      return (await res.json()) as Task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: taskQueryKeys.all });
    },
  });
}
