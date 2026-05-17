import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Index } from "../routes/index";
import { renderWithQuery } from "./test-utils";

// WebSocket モック（WsChat テストで send/onmessage を検証するため外部参照可能にする）
type MockWs = {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
  onmessage: ((event: MessageEvent) => void) | null;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
};

let mockWs: MockWs;
let MockWebSocket: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockWs = {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
    onmessage: null,
    onopen: null,
    onclose: null,
    onerror: null,
  };
  MockWebSocket = Object.assign(
    vi.fn(() => mockWs),
    { OPEN: 1 },
  );
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ===== WebSocket チャット =====

describe("WebSocket チャット", () => {
  it("マウント時に /ws へ接続する", async () => {
    renderWithQuery(<Index />);

    await waitFor(() => {
      expect(MockWebSocket).toHaveBeenCalledWith(
        expect.stringContaining("/ws"),
      );
    });
  });

  it("メッセージを入力して送信ボタンを押すと ws.send が呼ばれる", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Index />);

    await waitFor(() => expect(MockWebSocket).toHaveBeenCalled());

    await user.type(screen.getByPlaceholderText("メッセージ"), "こんにちは");
    await user.click(screen.getByRole("button", { name: "送信" }));

    expect(mockWs.send).toHaveBeenCalledWith(
      expect.stringContaining("こんにちは"),
    );
  });

  it("WebSocket からメッセージを受信すると画面に表示される", async () => {
    renderWithQuery(<Index />);

    await waitFor(() => expect(MockWebSocket).toHaveBeenCalled());

    const event = new MessageEvent("message", {
      data: JSON.stringify({ echo: "サーバーからの応答" }),
    });
    act(() => {
      mockWs.onmessage?.(event);
    });

    expect(await screen.findByText("サーバーからの応答")).toBeInTheDocument();
  });
});

describe("ダッシュボードページ", () => {
  it("見出しが表示される", async () => {
    renderWithQuery(<Index />);
    expect(await screen.findByText("Decision Loop")).toBeInTheDocument();
  });
});
