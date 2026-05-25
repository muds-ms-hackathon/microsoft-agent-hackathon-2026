import { AddReviewItemDialog } from "@/features/review/components/AddReviewItemDialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMeetingsGet, mockReviewItemsPost } = vi.hoisted(() => ({
  mockMeetingsGet: vi.fn(),
  mockReviewItemsPost: vi.fn(),
}));

vi.mock("@/features/recurring-meetings/hooks/useOrganizationMeetings", () => ({
  useOrganizationMeetings: () => ({
    data: [{ id: "rm-1", name: "週次定例", _count: { members: 1 } }],
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    organizations: {
      ":id": {
        meetings: { $get: vi.fn() },
      },
    },
    "recurring-meetings": {
      ":id": {
        meetings: { $get: mockMeetingsGet },
      },
    },
    meetings: {
      ":id": {
        "review-items": { $post: mockReviewItemsPost },
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockMeetingsGet.mockResolvedValue({
    ok: true,
    json: async () => [
      { id: "mtg-1", title: "5/25 定例", heldAt: "2026-05-25T10:00:00.000Z" },
    ],
  });
});

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("AddReviewItemDialog", () => {
  it("initialMeetingId を渡してダイアログを開いたとき、会議セレクトが initialMeetingId を保持する", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <AddReviewItemDialog orgId="org-1" initialRmId="rm-1" initialMeetingId="mtg-1" />,
    );

    await user.click(screen.getByRole("button", { name: "サンプルデータを入力" }));
    const dialog = await screen.findByRole("dialog");

    const meetingSelect = within(dialog).getByLabelText("会議");
    expect(meetingSelect).toHaveValue("mtg-1");
  });

  it("定例セレクトをユーザーが変更したとき、会議セレクトはクリアされる", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <AddReviewItemDialog orgId="org-1" initialRmId="rm-1" initialMeetingId="mtg-1" />,
    );

    await user.click(screen.getByRole("button", { name: "サンプルデータを入力" }));
    const dialog = await screen.findByRole("dialog");

    // 初期値が保持されていることを確認
    const meetingSelect = within(dialog).getByLabelText("会議");
    expect(meetingSelect).toHaveValue("mtg-1");

    // 定例セレクトを変更（同じ rm-1 から空に変更）
    const rmSelect = within(dialog).getByLabelText("定例");
    await user.selectOptions(rmSelect, "");

    expect(meetingSelect).toHaveValue("");
  });
});
