import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { taskQueryKeys } from "../queryKeys";
import type { Task } from "../types";

// 単一タスクの詳細を取得する。assignees に email が含まれる詳細用レスポンス。
// クエリキーは ["tasks", "detail", taskId]。
export function useTaskDetail(taskId: string) {
  return useQuery<Task>({
    queryKey: taskQueryKeys.detail(taskId),
    queryFn: async () => {
      const res = await api.tasks[":id"].$get(
        { param: { id: taskId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch task: ${res.status}`);
      }
      return (await res.json()) as Task;
    },
  });
}
