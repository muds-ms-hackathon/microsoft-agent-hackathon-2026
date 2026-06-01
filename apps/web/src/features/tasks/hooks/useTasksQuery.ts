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
  if (filters.organizationId) params.organizationId = filters.organizationId;
  if (filters.assigneeId) params.assigneeId = filters.assigneeId;
  if (filters.dueBefore) params.dueBefore = filters.dueBefore;
  if (filters.dueAfter) params.dueAfter = filters.dueAfter;
  // overdueOnly は ON のときだけ URL に乗せる。OFF（false / undefined）はパラメータごと消す
  // ことで、API 側の判定（"true" 完全一致）と整合させる。
  if (filters.overdueOnly) params.overdueOnly = "true";
  return params;
}
