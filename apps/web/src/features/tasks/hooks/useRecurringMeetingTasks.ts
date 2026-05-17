import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { taskQueryKeys } from "../queryKeys";
import type { TaskListFilters, TaskListItem } from "../types";
import { toTaskListQueryParams } from "./useTasksQuery";

// 定例（プロジェクト相当）に attach されたタスクを取得する。
// クエリキーは ["tasks", "recurring", rmId, filters]。
export function useRecurringMeetingTasks(
  rmId: string,
  filters?: TaskListFilters,
) {
  return useQuery<TaskListItem[]>({
    queryKey: taskQueryKeys.recurring(rmId, filters),
    queryFn: async () => {
      const res = await api["recurring-meetings"][":id"].tasks.$get(
        {
          param: { id: rmId },
          query: toTaskListQueryParams(filters),
        },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(
          `Failed to fetch recurring meeting tasks: ${res.status}`,
        );
      }
      return (await res.json()) as TaskListItem[];
    },
  });
}
