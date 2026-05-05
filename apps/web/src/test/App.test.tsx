import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { makeFakeIdToken } from "./helpers/auth";
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
  // 認証ガード（beforeLoad）をパスするため、makeFakeIdToken のデフォルト
  // exp（1 時間後）を活かした有効期限内ダミートークンをセットする。
  localStorage.setItem(
    "id_token",
    makeFakeIdToken({ sub: "1", email: "test@example.com", name: "test" }),
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
