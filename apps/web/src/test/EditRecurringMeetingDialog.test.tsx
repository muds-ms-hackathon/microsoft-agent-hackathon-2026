import type { RecurringMeeting } from "@/features/organizations/types";
import { EditRecurringMeetingDialog } from "@/features/recurring-meetings/components/EditRecurringMeetingDialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    "recurring-meetings": {
      ":id": {
        $patch: vi.fn(),
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

const sampleMeeting: RecurringMeeting = {
  id: "meet-1",
  organizationId: "org-1",
  name: "週次定例",
  description: null,
  scheduleCron: "0 10 * * 1",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// rerender 時に QueryClientProvider のラップを失わせないよう、wrapper でラップした
// ui を渡す。renderWithQuery の rerender ではラップが剥がれてしまうため。
function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrap = (node: React.ReactElement) => (
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  );
  const utils = render(wrap(ui));
  return {
    ...utils,
    rerender: (next: React.ReactElement) => utils.rerender(wrap(next)),
  };
}

describe("EditRecurringMeetingDialog の refetch 同期", () => {
  it("ダイアログを閉じている間に meeting prop が更新されると、次回開いた時にフォームが新値で初期化される", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithClient(
      <EditRecurringMeetingDialog meeting={sampleMeeting} />,
    );

    // 初回オープン: 既存値が表示されることを確認
    await user.click(screen.getByRole("button", { name: "編集" }));
    let dialog = await screen.findByRole("dialog", { name: "定例を編集" });
    expect(within(dialog).getByLabelText("定例名")).toHaveValue("週次定例");
    // close（ESC キーで閉じる）
    await user.keyboard("{Escape}");

    // ダイアログが閉じている間に親が新しい meeting を渡してくる
    // （実環境では refetch 後の useQuery が新値を返した状態）
    const updated: RecurringMeeting = {
      ...sampleMeeting,
      name: "別の名前",
      description: "親が更新した説明",
      scheduleCron: "0 14 * * 5",
    };
    rerender(<EditRecurringMeetingDialog meeting={updated} />);

    // 再オープン: フォームが新値で初期化されている
    await user.click(screen.getByRole("button", { name: "編集" }));
    dialog = await screen.findByRole("dialog", { name: "定例を編集" });
    expect(within(dialog).getByLabelText("定例名")).toHaveValue("別の名前");
    expect(within(dialog).getByLabelText("説明")).toHaveValue(
      "親が更新した説明",
    );
    // builder のプレビューも新 cron に追従（金曜 14:00）
    expect(
      within(dialog).getByLabelText("開催頻度プレビュー"),
    ).toHaveTextContent("毎週 金 14:00");
  });

  it("ダイアログを開いている間に meeting prop が変わっても、入力中の値は破壊されない", async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithClient(
      <EditRecurringMeetingDialog meeting={sampleMeeting} />,
    );

    // ダイアログを開いて name を編集途中の状態にする
    await user.click(screen.getByRole("button", { name: "編集" }));
    const dialog = await screen.findByRole("dialog", { name: "定例を編集" });
    const nameInput = within(dialog).getByLabelText("定例名");
    await user.clear(nameInput);
    await user.type(nameInput, "編集中の名前");

    // 開いている最中に親 (refetch 等) が別の値を渡してきても
    // フォームの編集中の値は維持される（useEffect が open===true の間は走らない）
    rerender(
      <EditRecurringMeetingDialog
        meeting={{ ...sampleMeeting, name: "外部からの上書き" }}
      />,
    );
    expect(within(dialog).getByLabelText("定例名")).toHaveValue("編集中の名前");
  });
});
