import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockJson } from "./helpers/mockJson";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    meetings: {
      ":id": {
        "topic-requests": {
          $get: vi.fn(),
          $post: vi.fn(),
        },
      },
    },
    "topic-requests": {
      ":id": {
        $patch: vi.fn(),
        $delete: vi.fn(),
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

import { api } from "@/lib/api";
import { TopicRequestSection } from "@/features/topic-requests/components/TopicRequestSection";
import type { TopicRequest } from "@/features/topic-requests/types";

const sample: TopicRequest = {
  id: "tr-1",
  meetingId: "mtg-1",
  requestedBy: "user-1",
  title: "次回までに決めたい仕様",
  body: "API レスポンスの形を決めたい",
  priority: "required",
  createdAt: "2026-05-17T10:00:00.000Z",
  updatedAt: "2026-05-17T10:00:00.000Z",
};

beforeEach(() => {
  vi.mocked(api.meetings[":id"]["topic-requests"].$get).mockResolvedValue(
    mockJson([]),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TopicRequestSection", () => {
  it("0 件のときは空メッセージを表示する", async () => {
    renderWithQuery(<TopicRequestSection meetingId="mtg-1" />);
    expect(
      await screen.findByText(/まだ議題が登録されていません/),
    ).toBeInTheDocument();
  });

  it("一覧をタイトル・本文・優先度バッジ付きで表示する", async () => {
    vi.mocked(api.meetings[":id"]["topic-requests"].$get).mockResolvedValue(
      mockJson([sample]),
    );
    renderWithQuery(<TopicRequestSection meetingId="mtg-1" />);
    expect(
      await screen.findByText("次回までに決めたい仕様"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("API レスポンスの形を決めたい"),
    ).toBeInTheDocument();
    expect(screen.getByText("必須")).toBeInTheDocument();
  });

  it("「議題を追加」ボタンでダイアログが開く", async () => {
    const user = userEvent.setup();
    renderWithQuery(<TopicRequestSection meetingId="mtg-1" />);
    await user.click(await screen.findByRole("button", { name: "議題を追加" }));
    expect(
      await screen.findByRole("heading", {
        name: "次回会議の議題を追加",
      }),
    ).toBeInTheDocument();
  });

  it("ダイアログのフォームから議題を作成できる", async () => {
    vi.mocked(api.meetings[":id"]["topic-requests"].$post).mockResolvedValue(
      mockJson({
        ...sample,
        id: "tr-new",
        title: "新規議題",
        body: null,
        priority: null,
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<TopicRequestSection meetingId="mtg-1" />);
    await user.click(await screen.findByRole("button", { name: "議題を追加" }));
    await user.type(await screen.findByLabelText("タイトル"), "新規議題");
    await user.click(screen.getByRole("button", { name: "追加" }));

    // 1 回目の呼び出し検証。json には title だけが入り、空 body / 未指定 priority は送らない。
    const calls = vi.mocked(api.meetings[":id"]["topic-requests"].$post).mock
      .calls;
    expect(calls.length).toBeGreaterThan(0);
    const [arg] = calls[0];
    expect((arg as { json: { title: string } }).json.title).toBe("新規議題");
    expect((arg as { json: { body?: string } }).json.body).toBeUndefined();
    expect(
      (arg as { json: { priority?: string } }).json.priority,
    ).toBeUndefined();
  });

  it("タイトル未入力で送信するとバリデーションエラーが出る", async () => {
    const user = userEvent.setup();
    renderWithQuery(<TopicRequestSection meetingId="mtg-1" />);
    await user.click(await screen.findByRole("button", { name: "議題を追加" }));
    await user.click(screen.getByRole("button", { name: "追加" }));
    expect(await screen.findByText("タイトルは必須です")).toBeInTheDocument();
    expect(
      vi.mocked(api.meetings[":id"]["topic-requests"].$post),
    ).not.toHaveBeenCalled();
  });

  it("編集ボタンで EditDialog が開き既存値が初期表示される", async () => {
    vi.mocked(api.meetings[":id"]["topic-requests"].$get).mockResolvedValue(
      mockJson([sample]),
    );
    const user = userEvent.setup();
    renderWithQuery(<TopicRequestSection meetingId="mtg-1" />);
    await screen.findByText("次回までに決めたい仕様");
    await user.click(screen.getByRole("button", { name: "編集" }));
    const dialog = await screen.findByRole("dialog", { name: /議題を編集/ });
    const titleInput = within(dialog).getByLabelText(
      "タイトル",
    ) as HTMLInputElement;
    expect(titleInput.value).toBe("次回までに決めたい仕様");
  });

  it("削除ボタン → 確認ダイアログで削除 API が呼ばれる", async () => {
    vi.mocked(api.meetings[":id"]["topic-requests"].$get).mockResolvedValue(
      mockJson([sample]),
    );
    vi.mocked(api["topic-requests"][":id"].$delete).mockResolvedValue(
      mockJson(null, 204),
    );
    const user = userEvent.setup();
    renderWithQuery(<TopicRequestSection meetingId="mtg-1" />);
    await screen.findByText("次回までに決めたい仕様");
    await user.click(screen.getByRole("button", { name: "削除" }));
    const dialog = await screen.findByRole("dialog", {
      name: /議題を削除しますか/,
    });
    await user.click(within(dialog).getByRole("button", { name: "削除" }));
    expect(api["topic-requests"][":id"].$delete).toHaveBeenCalledWith(
      { param: { id: "tr-1" } },
      { headers: {} },
    );
  });
});
