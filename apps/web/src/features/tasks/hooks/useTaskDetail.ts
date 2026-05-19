import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { taskQueryKeys } from "../queryKeys";
import type { Task } from "../types";

// 単一タスクの詳細を取得する。assignees に email が含まれる詳細用レスポンス。
// クエリキーは ["tasks", "detail", taskId]。
// taskId に null / 空文字を渡すと query は無効化される（行クリック前の初期状態に使う）。
export function useTaskDetail(taskId: string | null) {
  return useQuery<Task>({
    queryKey: taskQueryKeys.detail(taskId ?? ""),
    enabled: !!taskId,
    queryFn: async () => {
      if (!taskId) throw new Error("taskId is required");
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
