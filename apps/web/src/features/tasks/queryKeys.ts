import type { TaskListFilters } from "./types";

// TanStack Query の queryKey factory。
// 各 scope ごとに固定タプルを返すことで、mutation の invalidate 対象を
// 明示的に集合演算できるようにする（例: invalidateQueries({ queryKey: taskQueryKeys.all })）。
export const taskQueryKeys = {
  all: ["tasks"] as const,
  me: (filters?: TaskListFilters) =>
    [...taskQueryKeys.all, "me", filters ?? {}] as const,
  org: (orgId: string, filters?: TaskListFilters) =>
    [...taskQueryKeys.all, "org", orgId, filters ?? {}] as const,
  recurring: (rmId: string, filters?: TaskListFilters) =>
    [...taskQueryKeys.all, "recurring", rmId, filters ?? {}] as const,
  meeting: (meetingId: string, filters?: TaskListFilters) =>
    [...taskQueryKeys.all, "meeting", meetingId, filters ?? {}] as const,
  detail: (id: string) => [...taskQueryKeys.all, "detail", id] as const,
};
