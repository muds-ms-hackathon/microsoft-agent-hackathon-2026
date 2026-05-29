import type { MeetingDetail } from "@/features/meetings/hooks/useMeetingDetail";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    meetings: {
      ":id": {
        $get: vi.fn(),
        tasks: { $get: vi.fn() },
        "review-items": { $get: vi.fn() },
      },
    },
    organizations: {
      ":id": {
        members: { $get: vi.fn() },
        meetings: { $get: vi.fn() },
      },
    },
    tasks: {
      $post: vi.fn(),
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

// Link / createFileRoute は RouterProvider 配下でないと落ちるためまとめて差し替える。
vi.mock("@tanstack/react-router", async () => {
  const { buildRouterMock } = await import("./helpers/router-mock");
  return buildRouterMock({ mockFileRoute: true });
});

import { api } from "@/lib/api";
import { MeetingDetailView } from "../routes/meetings.$id";

import { mockJson } from "./helpers/mockJson";

const detail: MeetingDetail = {
  id: "mtg-1",
  title: "第3回",
  heldAt: "2026-05-17T01:00:00.000Z",
  estimatedDurationMinutes: 60,
  estimationNote: null,
  sequenceNumber: 3,
  previousMeetingId: null,
  transcriptionQuality: null,
  supplementaryMemo: null,
  meetingType: "recurring_meeting",
  recurringMeetingId: "rmtg-1",
  createdAt: "2026-05-01T00:00:00.000Z",
  recurringMeeting: { id: "rmtg-1", name: "週次定例" },
  organization: { id: "org-1", name: "ACME" },
  latestAnalysisRun: null,
  members: [],
};

const sampleTask = {
  id: "task-1",
  organizationId: "org-1",
  originMeetingId: "mtg-1",
  decisionItemId: null,
  title: "資料作成",
  body: null,
  sourceQuote: null,
  sourceContext: null,
  status: "todo" as const,
  priority: null,
  dueDateRaw: null,
  dueDateEstimated: null,
  assigneeRaw: null,
  blockingItemId: null,
  carriedOverCount: null,
  ambiguityFlags: null,
  progressNote: null,
  dueDate: null,
  startDate: null,
  followUpDate: null,
  version: 0,
  createdAt: "2026-05-17T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z",
  organization: { id: "org-1", name: "ACME" },
  originMeeting: {
    id: "mtg-1",
    title: "第3回",
    heldAt: "2026-05-17T01:00:00.000Z",
    recurringMeetingId: "rmtg-1",
  },
  assignees: [],
  recurringMeetings: [{ id: "rmtg-1", name: "週次定例" }],
};

beforeEach(() => {
  vi.mocked(api.meetings[":id"].$get).mockResolvedValue(mockJson(detail));
  vi.mocked(api.meetings[":id"].tasks.$get).mockResolvedValue(mockJson([]));
  vi.mocked(api.meetings[":id"]["review-items"].$get).mockResolvedValue(
    mockJson([]),
  );
  // AssigneeFilter のメンバー取得はデフォルトで空配列。個別テストで上書きしない想定。
  vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
    mockJson([]),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const NOW = new Date("2026-05-17T00:00:00Z");

describe("MeetingDetailView", () => {
  it("会議タイトル・日時・所要時間を表示する", async () => {
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    expect(await screen.findByText("第3回")).toBeInTheDocument();
    expect(screen.getByText("60 分")).toBeInTheDocument();
  });

  it("親定例へのパンくずリンクが /recurring-meetings/$id を指す", async () => {
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    const link = await screen.findByRole("link", {
      name: /週次定例 に戻る/,
    });
    expect(link).toHaveAttribute("href", "/recurring-meetings/rmtg-1");
  });

  it("タスク 1 件を行として表示する", async () => {
    vi.mocked(api.meetings[":id"].tasks.$get).mockResolvedValue(
      mockJson([sampleTask]),
    );
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    const list = await screen.findByLabelText("会議由来のタスク一覧");
    expect(within(list).getByText("資料作成")).toBeInTheDocument();
  });

  it("0 件時は専用メッセージを表示する", async () => {
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    expect(
      await screen.findByText("この会議から発生したタスクはまだありません"),
    ).toBeInTheDocument();
  });

  it("status フィルタ切替で onSearchChange が呼ばれる", async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <MeetingDetailView
        id="mtg-1"
        search={{}}
        onSearchChange={onSearchChange}
        now={NOW}
      />,
    );

    await screen.findByText("タスク");
    await user.click(screen.getByLabelText(/未着手/));
    expect(onSearchChange).toHaveBeenCalledWith({ status: "todo" });
  });

  it("初期 status フィルタが API リクエストに含まれる", async () => {
    renderWithQuery(
      <MeetingDetailView
        id="mtg-1"
        search={{ status: "in_progress" }}
        now={NOW}
      />,
    );
    await screen.findByText("タスク");
    const call = vi.mocked(api.meetings[":id"].tasks.$get).mock.calls[0];
    expect((call[0] as { query: { status?: string } }).query.status).toBe(
      "in_progress",
    );
  });

  it("会議取得失敗時はエラーメッセージを表示する", async () => {
    vi.mocked(api.meetings[":id"].$get).mockRejectedValue(new Error("network"));
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    expect(
      await screen.findByText("会議の取得に失敗しました"),
    ).toBeInTheDocument();
  });

  it("「タスクを追加」ボタンが押せる（CreateTaskDialog 起動）", async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson([]),
    );
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([]),
    );

    const user = userEvent.setup();
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    const addBtn = await screen.findByRole("button", { name: "タスクを追加" });
    expect(addBtn).not.toBeDisabled();
    await user.click(addBtn);
    // ダイアログが開いて Create のヘッダが見える
    expect(
      await screen.findByRole("heading", { name: "タスクを作成" }),
    ).toBeInTheDocument();
  });

  it("view=kanban のとき status フィルタ UI は描画されない", async () => {
    vi.mocked(api.meetings[":id"].tasks.$get).mockResolvedValue(
      mockJson([sampleTask]),
    );
    renderWithQuery(
      <MeetingDetailView id="mtg-1" search={{ view: "kanban" }} now={NOW} />,
    );
    await screen.findByTestId("kanban-board");
    // Kanban のカラムヘッダにも「未着手」等のラベルがあるため、
    // フィルタ UI 固有の group / 凡例ラベルで存在判定する。
    expect(
      screen.queryByRole("group", { name: "ステータス" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("ステータス")).not.toBeInTheDocument();
  });

  it("view=kanban のとき URL の status は API リクエストに乗らない（全件取得）", async () => {
    renderWithQuery(
      <MeetingDetailView
        id="mtg-1"
        search={{ view: "kanban", status: "todo" }}
        now={NOW}
      />,
    );
    await screen.findByText("タスク");
    const call = vi.mocked(api.meetings[":id"].tasks.$get).mock.calls[0];
    expect(
      (call[0] as { query: { status?: string } }).query.status,
    ).toBeUndefined();
  });

  it("フィルタ行に AssigneeFilter（担当者セレクタ）が描画される", async () => {
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    await screen.findByText("タスク");
    expect(screen.getByLabelText("担当者フィルタ")).toBeInTheDocument();
  });

  it("初期 ?assigneeId=user-42 は API リクエストの query.assigneeId に乗る", async () => {
    renderWithQuery(
      <MeetingDetailView
        id="mtg-1"
        search={{ assigneeId: "user-42" }}
        now={NOW}
      />,
    );
    await screen.findByText("タスク");
    const call = vi.mocked(api.meetings[":id"].tasks.$get).mock.calls[0];
    expect(
      (call[0] as { query: { assigneeId?: string } }).query.assigneeId,
    ).toBe("user-42");
  });
});

// NOW より前の heldAt を持つ過去の会議
const detailPast: MeetingDetail = {
  ...detail,
  heldAt: "2026-05-16T01:00:00.000Z",
};

describe("MeetingDetailView - 会議要約・AI抽出結果", () => {
  it("過去の会議では「会議要約」カードが表示される", async () => {
    vi.mocked(api.meetings[":id"].$get).mockResolvedValue(mockJson(detailPast));
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    expect(await screen.findByLabelText("会議要約")).toBeInTheDocument();
  });

  it("過去の会議では「AI抽出結果」カードが表示される", async () => {
    vi.mocked(api.meetings[":id"].$get).mockResolvedValue(mockJson(detailPast));
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    expect(await screen.findByLabelText("AI抽出結果")).toBeInTheDocument();
  });

  it("未来の会議では「会議要約」カードが表示されない", async () => {
    // detail.heldAt (2026-05-17T01:00:00Z) > NOW (2026-05-17T00:00:00Z)
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    await screen.findByText("第3回");
    expect(screen.queryByLabelText("会議要約")).not.toBeInTheDocument();
  });

  it("未来の会議では「AI抽出結果」カードが表示されない", async () => {
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    await screen.findByText("第3回");
    expect(screen.queryByLabelText("AI抽出結果")).not.toBeInTheDocument();
  });

  it("latestAnalysisRun.summary があればサマリーテキストが表示される", async () => {
    vi.mocked(api.meetings[":id"].$get).mockResolvedValue(
      mockJson({
        ...detailPast,
        latestAnalysisRun: {
          id: "run-1",
          status: "completed",
          summary: "今回の会議では予算について合意しました。",
          alertLevel: null,
          completedAt: "2026-05-16T02:00:00.000Z",
        },
      }),
    );
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    expect(
      await screen.findByText("今回の会議では予算について合意しました。"),
    ).toBeInTheDocument();
  });

  it("latestAnalysisRun が null のとき「要約はまだありません」が表示される", async () => {
    vi.mocked(api.meetings[":id"].$get).mockResolvedValue(
      mockJson({ ...detailPast, latestAnalysisRun: null }),
    );
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    expect(
      await screen.findByText("要約はまだありません"),
    ).toBeInTheDocument();
  });
});

describe("MeetingDetailView - 参加者アバター", () => {
  it("members があればアバターグループが表示される", async () => {
    vi.mocked(api.meetings[":id"].$get).mockResolvedValue(
      mockJson({
        ...detail,
        members: [
          { userId: "u-1", role: "owner", user: { id: "u-1", name: "Alice", displayName: "Alice" } },
          { userId: "u-2", role: "member", user: { id: "u-2", name: "Bob", displayName: "Bob" } },
        ],
      }),
    );
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    await screen.findByText("第3回");
    expect(
      screen.getByRole("group", { name: /担当者: Alice, Bob/ }),
    ).toBeInTheDocument();
  });

  it("members が空のときアバターグループが表示されない", async () => {
    vi.mocked(api.meetings[":id"].$get).mockResolvedValue(
      mockJson({ ...detail, members: [] }),
    );
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    await screen.findByText("第3回");
    expect(
      screen.queryByRole("group", { name: /担当者:/ }),
    ).not.toBeInTheDocument();
  });

  it("members が未定義のときアバターグループが表示されない", async () => {
    // latestAnalysisRun なし・members なしの既存 detail を使う
    renderWithQuery(<MeetingDetailView id="mtg-1" now={NOW} />);
    await screen.findByText("第3回");
    expect(
      screen.queryByRole("group", { name: /担当者:/ }),
    ).not.toBeInTheDocument();
  });
});
