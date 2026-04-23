import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

// index ページが依存する api モジュールをモック
vi.mock("@/lib/api", () => ({
  api: {
    meetings: {
      $get: vi.fn().mockResolvedValue({ json: async () => [] }),
      $post: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.stubGlobal(
    "WebSocket",
    vi.fn(() => ({
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
      onmessage: null,
      onopen: null,
      onclose: null,
      onerror: null,
    })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("App", () => {
  it("描画エラーなくルートページが表示される", async () => {
    renderWithQuery(<App />);
    expect(await screen.findByText("Decision Loop")).toBeInTheDocument();
  });
});
