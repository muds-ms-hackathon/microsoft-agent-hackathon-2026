import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// api クライアントをモックする。me.$get を差し替える。
vi.mock("@/lib/api", () => ({
  api: {
    me: {
      $get: vi.fn(),
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

import { api } from "@/lib/api";
import { useMe } from "./useMe";

function createWrapper() {
  // 失敗系テストではデフォルトのリトライを無効化して即 isError にする。
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return wrapper;
}

describe("useMe", () => {
  let getMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getMock = api.me.$get as unknown as ReturnType<typeof vi.fn>;
    getMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "user-1",
        email: "me@example.com",
        name: "Me User",
        displayName: "Me User",
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("自分のプロフィールを取得する", async () => {
    const { result } = renderHook(() => useMe(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      id: "user-1",
      email: "me@example.com",
      name: "Me User",
      displayName: "Me User",
    });
  });

  it("API がエラーを返すと失敗する", async () => {
    getMock.mockResolvedValue({ ok: false, status: 401 });
    const { result } = renderHook(() => useMe(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
