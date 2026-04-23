import type { Meeting } from "@/types/meeting";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Index } from "../routes/index";
import { renderWithQuery } from "./test-utils";

// hono/client api モジュールをモック
vi.mock("@/lib/api", () => ({
  api: {
    meetings: {
      $get: vi.fn(),
      $post: vi.fn(),
    },
  },
}));

import { api } from "@/lib/api";

const mockMeetings: Meeting[] = [
  {
    id: "1",
    title: "週次定例",
    heldAt: "2026-04-21T10:00:00.000Z",
    createdAt: "2026-04-20T00:00:00.000Z",
  },
  {
    id: "2",
    title: "月次レビュー",
    heldAt: "2026-04-14T14:00:00.000Z",
    createdAt: "2026-04-13T00:00:00.000Z",
  },
];

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
  MockWebSocket = Object.assign(vi.fn(() => mockWs), { OPEN: 1 });
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ===== meetings 一覧表示 =====

describe("meetings 一覧表示", () => {
  it("meetings の一覧が表示される", async () => {
    vi.mocked(api.meetings.$get).mockResolvedValue({
      json: async () => mockMeetings,
    } as never);

    renderWithQuery(<Index />);

    expect(await screen.findByText("週次定例")).toBeInTheDocument();
    expect(await screen.findByText("月次レビュー")).toBeInTheDocument();
  });

  it("meetings が空のとき会議一覧に項目がない", async () => {
    vi.mocked(api.meetings.$get).mockResolvedValue({
      json: async () => [],
    } as never);

    renderWithQuery(<Index />);

    const list = await screen.findByRole("list", { name: "会議一覧" });
    expect(within(list).queryAllByRole("listitem")).toHaveLength(0);
  });
});

// ===== meeting 作成フォーム =====

describe("meeting 作成フォーム", () => {
  beforeEach(() => {
    vi.mocked(api.meetings.$get).mockResolvedValue({
      json: async () => [],
    } as never);
  });

  it("title が空のとき送信できない", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Index />);

    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(await screen.findByText("タイトルは必須です")).toBeInTheDocument();
    expect(api.meetings.$post).not.toHaveBeenCalled();
  });

  it("heldAt が空のとき送信できない", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Index />);

    await user.type(screen.getByPlaceholderText("タイトル"), "テスト会議");
    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(await screen.findByText("開催日時は必須です")).toBeInTheDocument();
    expect(api.meetings.$post).not.toHaveBeenCalled();
  });

  it("正常送信で api.$post が呼ばれ一覧が再取得される", async () => {
    const user = userEvent.setup();
    const newMeeting: Meeting = {
      id: "3",
      title: "テスト会議",
      heldAt: "2026-04-23T10:00:00.000Z",
      createdAt: "2026-04-23T00:00:00.000Z",
    };
    vi.mocked(api.meetings.$post).mockResolvedValue({
      json: async () => newMeeting,
    } as never);
    vi.mocked(api.meetings.$get)
      .mockResolvedValueOnce({ json: async () => [] } as never)
      .mockResolvedValueOnce({ json: async () => [newMeeting] } as never);

    renderWithQuery(<Index />);

    await user.type(screen.getByLabelText("タイトル"), "テスト会議");
    await user.type(screen.getByLabelText("開催日時"), "2026-04-23T10:00");
    await user.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(api.meetings.$post).toHaveBeenCalled();
    });
    expect(await screen.findByText("テスト会議")).toBeInTheDocument();
  });
});

// ===== WebSocket チャット =====

describe("WebSocket チャット", () => {
  beforeEach(() => {
    vi.mocked(api.meetings.$get).mockResolvedValue({
      json: async () => [],
    } as never);
  });

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
