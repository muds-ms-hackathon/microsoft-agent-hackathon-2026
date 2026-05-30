import { useMarkTaskRead } from "@/features/tasks/hooks/useMarkTaskRead";
import { taskQueryKeys } from "@/features/tasks/queryKeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMarkTaskRead", () => {
  function makeClient() {
    return new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
  }

  it("成功時に 204 を受け取り、tasks クエリを invalidate する", async () => {
    mockFetchOnce({ status: 204 });
    const client = makeClient();
    const spy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useMarkTaskRead(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync("task-1");
    });

    // /tasks/me の未読フラグを更新させるため tasks スコープを invalidate する。
    expect(spy).toHaveBeenCalledWith({ queryKey: taskQueryKeys.all });
  });

  it("非 2xx のとき reject する", async () => {
    mockFetchOnce({ status: 500 }, { error: "internal" });
    const client = makeClient();

    const { result } = renderHook(() => useMarkTaskRead(), {
      wrapper: makeWrapper(client),
    });

    await expect(result.current.mutateAsync("task-1")).rejects.toThrow();
  });
});
