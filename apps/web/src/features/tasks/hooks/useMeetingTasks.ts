import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { taskQueryKeys } from "../queryKeys";
import type { TaskListFilters, TaskListItem } from "../types";
import { toTaskListQueryParams } from "./useTasksQuery";

// 当該会議を発生源とするタスクを取得する。
// クエリキーは ["tasks", "meeting", meetingId, filters]。
export function useMeetingTasks(meetingId: string, filters?: TaskListFilters) {
  return useQuery<TaskListItem[]>({
    queryKey: taskQueryKeys.meeting(meetingId, filters),
    queryFn: async () => {
      const res = await api.meetings[":id"].tasks.$get(
        {
          param: { id: meetingId },
          query: toTaskListQueryParams(filters),
        },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch meeting tasks: ${res.status}`);
      }
      return (await res.json()) as TaskListItem[];
    },
  });
}
