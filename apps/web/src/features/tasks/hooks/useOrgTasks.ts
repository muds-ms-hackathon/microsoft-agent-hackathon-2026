import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { taskQueryKeys } from "../queryKeys";
import type { TaskListFilters, TaskListItem } from "../types";
import { toTaskListQueryParams } from "./useTasksQuery";

// 組織配下の全タスクを取得する。
// クエリキーは ["tasks", "org", orgId, filters]。
export function useOrgTasks(orgId: string, filters?: TaskListFilters) {
  return useQuery<TaskListItem[]>({
    queryKey: taskQueryKeys.org(orgId, filters),
    queryFn: async () => {
      const res = await api.organizations[":id"].tasks.$get(
        {
          param: { id: orgId },
          query: toTaskListQueryParams(filters),
        },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch organization tasks: ${res.status}`);
      }
      return (await res.json()) as TaskListItem[];
    },
  });
}
