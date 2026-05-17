import type { TaskListFilters } from "../types";

// 一覧 API のクエリパラメータを API 仕様（status はカンマ区切り文字列）に変換する。
// hono/client の $get に渡す query オブジェクトとして使う。
export function toTaskListQueryParams(
  filters?: TaskListFilters,
): Record<string, string> {
  if (!filters) return {};
  const params: Record<string, string> = {};
  if (filters.status && filters.status.length > 0) {
    params.status = filters.status.join(",");
  }
  if (filters.assigneeId) params.assigneeId = filters.assigneeId;
  if (filters.dueBefore) params.dueBefore = filters.dueBefore;
  if (filters.dueAfter) params.dueAfter = filters.dueAfter;
  return params;
}
