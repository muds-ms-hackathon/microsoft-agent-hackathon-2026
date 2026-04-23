import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { renderWithQuery } from "./test-utils";

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
    Object.assign(
      vi.fn(() => ({
        send: vi.fn(),
        close: vi.fn(),
        readyState: 1,
        onmessage: null,
        onopen: null,
        onclose: null,
        onerror: null,
      })),
      { OPEN: 1 },
    ),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("描画エラーなくルートページが表示される", async () => {
    renderWithQuery(<App />);
    expect(await screen.findByText("Decision Loop")).toBeInTheDocument();
  });
});
