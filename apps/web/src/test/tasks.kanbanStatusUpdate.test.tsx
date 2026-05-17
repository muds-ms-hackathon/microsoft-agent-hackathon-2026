import { useKanbanStatusUpdate } from "@/features/tasks/hooks/useKanbanStatusUpdate";
import { TaskVersionConflictError } from "@/features/tasks/hooks/useUpdateTask";
import type { TaskListItem } from "@/features/tasks/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// グローバル fetch をモックして API 呼び出しを切り離す。
function mockFetchOnce(init: ResponseInit, body: unknown = null) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    new Response(body === null ? null : JSON.stringify(body), init),
  );
}

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const baseTask = (overrides: Partial<TaskListItem> = {}): TaskListItem => ({
  id: "task-1",
  organizationId: "org-1",
  originMeetingId: null,
  decisionItemId: null,
  title: "資料作成",
  body: null,
  sourceQuote: null,
  sourceContext: null,
  status: "todo",
  priority: null,
  dueDateRaw: null,
  dueDateEstimated: null,
  assigneeRaw: null,
  blockingItemId: null,
  carriedOverCount: null,
  ambiguityFlags: null,
  progressNote: null,
  dueDate: null,
  startDate: null,
  followUpDate: null,
  version: 0,
  createdAt: "2026-05-17T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z",
  organization: { id: "org-1", name: "ACME" },
  originMeeting: null,
  assignees: [],
  recurringMeetings: [],
  ...overrides,
});

const queryKey = ["tasks", "me", {}];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useKanbanStatusUpdate", () => {
  it("成功時: 楽観的に status を更新し、確定後も維持される", async () => {
    mockFetchOnce({ status: 200 }, { id: "task-1", status: "in_progress" });

    const client = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    client.setQueryData<TaskListItem[]>(queryKey, [baseTask()]);

    const { result } = renderHook(() => useKanbanStatusUpdate(queryKey), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        taskId: "task-1",
        version: 0,
        status: "in_progress",
      });
    });

    // setQueryData による楽観的更新が反映されている
    const after = client.getQueryData<TaskListItem[]>(queryKey);
    expect(after?.[0].status).toBe("in_progress");
  });

  it("非 2xx で rollback して prev に戻る", async () => {
    mockFetchOnce({ status: 500 }, { error: "internal" });

    const client = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    const prev = [baseTask()];
    client.setQueryData<TaskListItem[]>(queryKey, prev);

    const { result } = renderHook(() => useKanbanStatusUpdate(queryKey), {
      wrapper: makeWrapper(client),
    });

    await expect(
      result.current.mutateAsync({
        taskId: "task-1",
        version: 0,
        status: "done",
      }),
    ).rejects.toThrow(/Failed to update task status: 500/);

    // rollback で元の status に戻っている
    await waitFor(() => {
      const after = client.getQueryData<TaskListItem[]>(queryKey);
      expect(after?.[0].status).toBe("todo");
    });
  });

  it("409 は TaskVersionConflictError として throw し、rollback される", async () => {
    mockFetchOnce({ status: 409 }, { error: "conflict" });

    const client = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    client.setQueryData<TaskListItem[]>(queryKey, [baseTask()]);

    const { result } = renderHook(() => useKanbanStatusUpdate(queryKey), {
      wrapper: makeWrapper(client),
    });

    await expect(
      result.current.mutateAsync({
        taskId: "task-1",
        version: 0,
        status: "done",
      }),
    ).rejects.toBeInstanceOf(TaskVersionConflictError);

    await waitFor(() => {
      const after = client.getQueryData<TaskListItem[]>(queryKey);
      expect(after?.[0].status).toBe("todo");
    });
  });

  it("mutate 中の楽観的更新が即座に反映される（onMutate）", async () => {
    // mutationFn は遅延させて、楽観的更新の即時性を観察する
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                new Response(JSON.stringify({ id: "task-1" }), { status: 200 }),
              ),
            50,
          ),
        ),
    );

    const client = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    client.setQueryData<TaskListItem[]>(queryKey, [baseTask()]);

    const { result } = renderHook(() => useKanbanStatusUpdate(queryKey), {
      wrapper: makeWrapper(client),
    });

    act(() => {
      result.current.mutate({
        taskId: "task-1",
        version: 0,
        status: "in_progress",
      });
    });

    // mutate 直後（API 応答前）に楽観的更新が反映されているはず
    await waitFor(() => {
      const optimistic = client.getQueryData<TaskListItem[]>(queryKey);
      expect(optimistic?.[0].status).toBe("in_progress");
    });
  });
});
