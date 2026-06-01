import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// api クライアントをモックする。me.$patch を差し替える。
vi.mock("@/lib/api", () => ({
  api: {
    me: {
      $patch: vi.fn(),
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

import { api } from "@/lib/api";
import { useUpdateDisplayName } from "./useUpdateDisplayName";

function createWrapper() {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return wrapper;
}

describe("useUpdateDisplayName", () => {
  let patchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    patchMock = api.me.$patch as unknown as ReturnType<typeof vi.fn>;
    patchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "user-1",
        email: "me@example.com",
        name: "Me User",
        displayName: "新しい表示名",
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("表示名の更新に成功する", async () => {
    const { result } = renderHook(() => useUpdateDisplayName(), {
      wrapper: createWrapper(),
    });
    result.current.mutate("新しい表示名");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // displayName を json として送信する。
    expect(patchMock).toHaveBeenCalledWith(
      { json: { displayName: "新しい表示名" } },
      { headers: {} },
    );
  });

  it("API がエラーを返すと失敗する", async () => {
    patchMock.mockResolvedValue({ ok: false, status: 400 });
    const { result } = renderHook(() => useUpdateDisplayName(), {
      wrapper: createWrapper(),
    });
    result.current.mutate("");
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
