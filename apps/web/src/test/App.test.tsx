import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { makeFakeIdToken } from "./helpers/auth";
import { renderWithQuery } from "./test-utils";

// ダッシュボードが依存する api モジュールをモック
vi.mock("@/lib/api", () => ({
  api: {
    organizations: {
      ":id": {
        meetings: {
          $get: vi.fn().mockResolvedValue({ json: async () => [] }),
        },
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

beforeEach(() => {
  // 認証ガード（beforeLoad）をパスするため、makeFakeIdToken のデフォルト
  // exp（1 時間後）を活かした有効期限内ダミートークンをセットする。
  localStorage.setItem(
    "id_token",
    makeFakeIdToken({ sub: "1", email: "test@example.com", name: "test" }),
  );
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("描画エラーなくルートページが表示される", async () => {
    renderWithQuery(<App />);
    expect(
      await screen.findByRole("heading", { name: "ダッシュボード" }),
    ).toBeInTheDocument();
  });
});
