import { useOrganizationNextMeetings } from "@/features/recurring-meetings/hooks/useOrganizationNextMeetings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// グローバル fetch をモックして API 呼び出しを切り離す。各テストでレスポンスを上書きする。
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

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

describe("useOrganizationNextMeetings", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("orgId が null のときは API を呼ばず無効化される", async () => {
    const client = makeClient();
    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;

    const { result } = renderHook(() => useOrganizationNextMeetings(null, 5), {
      wrapper: makeWrapper(client),
    });

    // enabled: false の状態は fetchStatus === "idle" + data === undefined で確認する。
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("orgId 指定時は limit クエリ付きで取得し、レスポンスを返す", async () => {
    const payload = [
      {
        id: "mtg-1",
        title: "週次定例 2026-05-20",
        heldAt: "2026-05-20T01:00:00.000Z",
        estimatedDurationMinutes: 60,
        recurringMeetingId: "rmtg-1",
        recurringMeetingName: "週次定例",
      },
    ];
    mockFetchOnce({ status: 200 }, payload);

    const client = makeClient();
    const { result } = renderHook(
      () => useOrganizationNextMeetings("org-1", 5),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(payload);
    });

    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = (fetchSpy.mock.calls[0][0] as Request | string).toString();
    expect(url).toContain("/organizations/org-1/next-meetings");
    expect(url).toContain("limit=5");
  });

  it("limit が異なれば別キャッシュとして再フェッチされる", async () => {
    mockFetchOnce({ status: 200 }, []);
    mockFetchOnce({ status: 200 }, [{ id: "mtg-2" }]);

    const client = makeClient();
    const { result, rerender } = renderHook(
      ({ limit }: { limit: number }) =>
        useOrganizationNextMeetings("org-1", limit),
      {
        wrapper: makeWrapper(client),
        initialProps: { limit: 3 },
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    rerender({ limit: 5 });
    await waitFor(() => {
      expect(result.current.data).toEqual([{ id: "mtg-2" }]);
    });

    const fetchSpy = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("非 2xx レスポンスのときは isError になる", async () => {
    mockFetchOnce({ status: 500 }, { error: "boom" });

    const client = makeClient();
    const { result } = renderHook(
      () => useOrganizationNextMeetings("org-1", 5),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
