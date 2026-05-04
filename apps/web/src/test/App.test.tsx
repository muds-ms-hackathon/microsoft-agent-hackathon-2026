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
  // 認証ガード（beforeLoad）をパスするためダミートークンをセット
  localStorage.setItem(
    "id_token",
    "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwibmFtZSI6InRlc3QifQ.",
  );
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
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("描画エラーなくルートページが表示される", async () => {
    renderWithQuery(<App />);
    expect(await screen.findByText("Decision Loop")).toBeInTheDocument();
  });
});
