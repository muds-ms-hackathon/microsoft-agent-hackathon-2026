import { useCreateTask } from "@/features/tasks/hooks/useCreateTask";
import { useDeleteTask } from "@/features/tasks/hooks/useDeleteTask";
import {
  TaskVersionConflictError,
  useUpdateTask,
} from "@/features/tasks/hooks/useUpdateTask";
import { taskQueryKeys } from "@/features/tasks/queryKeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// グローバル fetch をモックして API 呼び出しを完全に切り離す。
// 各テストでレスポンスを上書きする。
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

describe("useCreateTask", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功時に taskQueryKeys.all を invalidate する", async () => {
    mockFetchOnce({ status: 201 }, { id: "task-1" });

    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateTask(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        organizationId: "org-1",
        title: "x",
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: taskQueryKeys.all,
    });
  });

  it("非 2xx は Error として throw", async () => {
    mockFetchOnce({ status: 400 }, { error: "bad request" });

    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const { result } = renderHook(() => useCreateTask(), {
      wrapper: makeWrapper(client),
    });

    await expect(
      result.current.mutateAsync({ organizationId: "org-1", title: "x" }),
    ).rejects.toThrow(/Failed to create task: 400/);
  });
});

describe("useUpdateTask", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功時に detail と all を invalidate する", async () => {
    mockFetchOnce({ status: 200 }, { id: "task-1", version: 1 });

    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateTask("task-1"), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ version: 0, title: "更新後" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: taskQueryKeys.detail("task-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: taskQueryKeys.all,
    });
  });

  it("409 は TaskVersionConflictError を throw", async () => {
    mockFetchOnce({ status: 409 }, { error: "conflict" });

    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const { result } = renderHook(() => useUpdateTask("task-1"), {
      wrapper: makeWrapper(client),
    });

    await expect(
      result.current.mutateAsync({ version: 0, title: "x" }),
    ).rejects.toBeInstanceOf(TaskVersionConflictError);
  });
});

describe("useDeleteTask", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("成功時に detail(taskId) と all を invalidate する", async () => {
    mockFetchOnce({ status: 204 });

    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useDeleteTask(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync("task-1");
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: taskQueryKeys.detail("task-1"),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: taskQueryKeys.all,
      });
    });
  });
});
