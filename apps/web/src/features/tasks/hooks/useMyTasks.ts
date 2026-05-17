import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { taskQueryKeys } from "../queryKeys";
import type { TaskListFilters, TaskListItem } from "../types";
import { toTaskListQueryParams } from "./useTasksQuery";

// 認証ユーザーが担当のタスクを組織横断で取得する。
// クエリキーは ["tasks", "me", filters] で、mutation 後に invalidate される。
export function useMyTasks(filters?: TaskListFilters) {
  return useQuery<TaskListItem[]>({
    queryKey: taskQueryKeys.me(filters),
    queryFn: async () => {
      const res = await api.tasks.me.$get(
        { query: toTaskListQueryParams(filters) },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch my tasks: ${res.status}`);
      }
      return (await res.json()) as TaskListItem[];
    },
  });
}
