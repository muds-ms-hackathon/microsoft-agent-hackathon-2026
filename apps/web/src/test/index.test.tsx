import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    organizations: {
      ":id": {
        meetings: { $get: vi.fn() },
        "review-items": { $get: vi.fn() },
      },
    },
    "recurring-meetings": {
      ":id": {
        meetings: { $get: vi.fn() },
      },
    },
    tasks: {
      me: { $get: vi.fn() },
      ":id": { read: { $post: vi.fn() } },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

// Link は RouterProvider 配下でないと useRouter で落ちるためモック。
// recurring-meetings.$id.test と同じ方式。
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  type MockLinkProps = {
    to: string;
    params?: Record<string, string>;
    children?: React.ReactNode;
    className?: string;
  };
  return {
    ...actual,
    Link: ({ to, params, children, className }: MockLinkProps) => {
      const href =
        typeof to === "string"
          ? to.replace(/\$(\w+)/g, (_, k: string) => params?.[k] ?? "")
          : String(to);
      return (
        <a href={href} className={className}>
          {children}
        </a>
      );
    },
    createFileRoute: () => () => ({}),
  };
});

// currentOrganizationIdAtom は atomWithStorage で global store に残るため、
// useAtomValue をモックして各テストで値を制御する。
vi.mock("jotai", async () => {
  const actual = await vi.importActual<typeof import("jotai")>("jotai");
  return { ...actual, useAtomValue: vi.fn() };
});

import { api } from "@/lib/api";
import type { ReviewItem } from "@/features/review/types";
import type { TaskListItem } from "@/features/tasks/types";
import { useAtomValue } from "jotai";
import { Dashboard } from "../routes/index";

function mockJson<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as never;
}

// fake timer を避けるため、現在時刻より確実に未来・過去の日時を使う
const NEAR_FUTURE = "2099-01-01T10:00:00.000Z";
const FAR_FUTURE = "2099-06-01T10:00:00.000Z";
const PAST = "2000-01-01T10:00:00.000Z";

const RM_1 = {
  id: "rm-1",
  name: "週次定例",
  _count: { members: 0 },
  members: [],
};
const RM_2 = {
  id: "rm-2",
  name: "月次レビュー",
  _count: { members: 0 },
  members: [],
};

function makeReviewItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: "item-1",
    sourceTable: "task",
    type: "task_candidate",
    title: "テストタスク",
    body: null,
    sourceQuote: null,
    sourceContext: null,
    status: "draft",
    assignees: [],
    deadline: null,
    severity: null,
    resolutionType: null,
    recurringMeetingId: "rmtg-1",
    recurringMeetingName: "週次定例",
    meetingId: "mtg-1",
    version: 0,
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: "task-1",
    organizationId: "org-1",
    originMeetingId: null,
    decisionItemId: null,
    title: "テストタスク",
    body: null,
    sourceQuote: null,
    sourceContext: null,
    status: "todo",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    organization: { id: "org-1", name: "ACME" },
    originMeeting: null,
    assignees: [],
    recurringMeetings: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function render() {
  // 既存テストが新しいエンドポイントで undefined を返して落ちないようデフォルトを設定する
  vi.mocked(api.organizations[":id"]["review-items"].$get).mockResolvedValue(
    mockJson([]),
  );
  vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([]));
  return renderWithQuery(<Dashboard />);
}

// ===== 組織未選択 =====

describe("Dashboard - 組織未選択", () => {
  beforeEach(() => {
    vi.mocked(useAtomValue).mockReturnValue(null);
  });

  it("「サイドバーから組織を選択してください」が表示される", () => {
    render();
    expect(
      screen.getByText("サイドバーから組織を選択してください"),
    ).toBeInTheDocument();
  });
});

// ===== NextMeetingsSection =====

describe("Dashboard - NextMeetingsSection", () => {
  beforeEach(() => {
    vi.mocked(useAtomValue).mockReturnValue("org-1");
  });

  it("全定例が空のとき「予定されている会議はありません」が表示される", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([]),
    );
    render();
    expect(
      await screen.findByText("予定されている会議はありません"),
    ).toBeInTheDocument();
  });

  it("過去会議のみの定例は upcoming から除外され「予定されている会議はありません」が表示される", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([RM_1]),
    );
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson([
        {
          id: "mtg-past",
          title: "過去の会議",
          heldAt: PAST,
          estimatedDurationMinutes: 60,
          recurringMeetingId: "rm-1",
        },
      ]),
    );
    render();
    expect(
      await screen.findByText("予定されている会議はありません"),
    ).toBeInTheDocument();
  });

  it("複数定例がある場合、すべての定例名が表示される", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([RM_1, RM_2]),
    );
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get)
      .mockResolvedValueOnce(
        mockJson([
          {
            id: "mtg-rm1",
            title: "週次定例 会議",
            heldAt: FAR_FUTURE,
            estimatedDurationMinutes: 60,
            recurringMeetingId: "rm-1",
          },
        ]),
      )
      .mockResolvedValueOnce(
        mockJson([
          {
            id: "mtg-rm2",
            title: "月次レビュー 会議",
            heldAt: NEAR_FUTURE,
            estimatedDurationMinutes: 60,
            recurringMeetingId: "rm-2",
          },
        ]),
      );
    render();
    expect(await screen.findByText("週次定例")).toBeInTheDocument();
    expect(screen.getByText("月次レビュー")).toBeInTheDocument();
  });

  it("複数定例の会議カードが heldAt の昇順（近い順）で並ぶ", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([RM_1, RM_2]),
    );
    // rm-1 は遠い未来、rm-2 は近い未来 → rm-2 が先に表示される
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get)
      .mockResolvedValueOnce(
        mockJson([
          {
            id: "mtg-rm1",
            title: "週次定例 会議",
            heldAt: FAR_FUTURE,
            estimatedDurationMinutes: 60,
            recurringMeetingId: "rm-1",
          },
        ]),
      )
      .mockResolvedValueOnce(
        mockJson([
          {
            id: "mtg-rm2",
            title: "月次レビュー 会議",
            heldAt: NEAR_FUTURE,
            estimatedDurationMinutes: 60,
            recurringMeetingId: "rm-2",
          },
        ]),
      );
    render();
    await screen.findByText("週次定例");
    const cards = screen.getAllByRole("link", { name: /詳細/ });
    expect(cards[0]).toHaveAttribute("href", "/recurring-meetings/rm-2");
    expect(cards[1]).toHaveAttribute("href", "/recurring-meetings/rm-1");
  });

  it("定例取得が失敗したとき「定例の取得に失敗しました」が表示される", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockRejectedValue(
      new Error("network"),
    );
    render();
    expect(
      await screen.findByText("定例の取得に失敗しました"),
    ).toBeInTheDocument();
  });

  it("会議取得が失敗したとき「定例の取得に失敗しました」が表示される", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([RM_1]),
    );
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockRejectedValue(
      new Error("network"),
    );
    render();
    expect(
      await screen.findByText("定例の取得に失敗しました"),
    ).toBeInTheDocument();
  });

  it("members があるとき AvatarStack が表示される", async () => {
    const rmWithMembers = {
      ...RM_1,
      _count: { members: 1 },
      members: [
        {
          userId: "u-1",
          role: "owner",
          user: { id: "u-1", name: "Alice", displayName: "Alice" },
        },
      ],
    };
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([rmWithMembers]),
    );
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson([
        {
          id: "mtg-1",
          title: "週次定例 会議",
          heldAt: NEAR_FUTURE,
          estimatedDurationMinutes: 60,
          recurringMeetingId: "rm-1",
        },
      ]),
    );
    render();
    await screen.findByText("週次定例");
    expect(
      screen.getByRole("group", { name: /担当者: Alice/ }),
    ).toBeInTheDocument();
  });

  it("members が空のとき AvatarStack が表示されない", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([RM_1]),
    );
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson([
        {
          id: "mtg-1",
          title: "週次定例 会議",
          heldAt: NEAR_FUTURE,
          estimatedDurationMinutes: 60,
          recurringMeetingId: "rm-1",
        },
      ]),
    );
    render();
    await screen.findByText("週次定例");
    expect(
      screen.queryByRole("group", { name: /担当者:/ }),
    ).not.toBeInTheDocument();
  });

  it("「詳細」リンクが最も直近の定例の id のページに向いている", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([RM_1, RM_2]),
    );
    // rm-2 の方が近い → 詳細リンクは /recurring-meetings/rm-2
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get)
      .mockResolvedValueOnce(
        mockJson([
          {
            id: "mtg-rm1",
            title: "週次定例 会議",
            heldAt: FAR_FUTURE,
            estimatedDurationMinutes: 60,
            recurringMeetingId: "rm-1",
          },
        ]),
      )
      .mockResolvedValueOnce(
        mockJson([
          {
            id: "mtg-rm2",
            title: "月次レビュー 会議",
            heldAt: NEAR_FUTURE,
            estimatedDurationMinutes: 60,
            recurringMeetingId: "rm-2",
          },
        ]),
      );
    render();
    const links = await screen.findAllByRole("link", { name: /詳細/ });
    expect(links[0]).toHaveAttribute("href", "/recurring-meetings/rm-2");
  });
});

// ===== ReviewPendingCard =====
// render() はデフォルトモックを上書きするため、このブロックでは renderWithQuery を直接使う。

describe("Dashboard - ReviewPendingCard", () => {
  beforeEach(() => {
    vi.mocked(useAtomValue).mockReturnValue("org-1");
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([]),
    );
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([]));
  });

  function renderDashboard() {
    return renderWithQuery(<Dashboard />);
  }

  it("アイテムが空のとき「レビュー待ちのアイテムはありません」が表示される", async () => {
    vi.mocked(api.organizations[":id"]["review-items"].$get).mockResolvedValue(
      mockJson([]),
    );
    renderDashboard();
    expect(
      await screen.findByText("レビュー待ちのアイテムはありません"),
    ).toBeInTheDocument();
  });

  it("取得失敗時に「取得に失敗しました」が表示される", async () => {
    vi.mocked(api.organizations[":id"]["review-items"].$get).mockRejectedValue(
      new Error("network"),
    );
    renderDashboard();
    expect(await screen.findByText("取得に失敗しました")).toBeInTheDocument();
  });

  it("種別ごとに件数が集計されて表示される", async () => {
    vi.mocked(api.organizations[":id"]["review-items"].$get).mockResolvedValue(
      mockJson([
        makeReviewItem({ id: "r1", type: "task_candidate" }),
        makeReviewItem({ id: "r2", type: "task_candidate" }),
        makeReviewItem({ id: "r3", type: "open_issue" }),
      ]),
    );
    renderDashboard();
    expect(await screen.findByText("タスク候補")).toBeInTheDocument();
    expect(screen.getByText("未決事項")).toBeInTheDocument();
    // 種別バッジの件数が正しい値で表示される
    const reviewCard = screen
      .getByText("タスク候補")
      .closest("[data-slot=card]");
    expect(reviewCard).toBeTruthy();
    expect(reviewCard?.textContent).toContain("2");
    expect(reviewCard?.textContent).toContain("1");
  });

  it("件数が0の種別は表示されない", async () => {
    vi.mocked(api.organizations[":id"]["review-items"].$get).mockResolvedValue(
      mockJson([makeReviewItem({ id: "r1", type: "open_issue" })]),
    );
    renderDashboard();
    await screen.findByText("未決事項");
    expect(screen.queryByText("タスク候補")).not.toBeInTheDocument();
    expect(screen.queryByText("曖昧箇所")).not.toBeInTheDocument();
  });

  it("ヘッダーに総件数バッジが表示される", async () => {
    vi.mocked(api.organizations[":id"]["review-items"].$get).mockResolvedValue(
      mockJson([
        makeReviewItem({ id: "r1", type: "task_candidate" }),
        makeReviewItem({ id: "r2", type: "open_issue" }),
        makeReviewItem({ id: "r3", type: "open_issue" }),
      ]),
    );
    renderDashboard();
    // データ取得完了後にバッジが描画される
    expect(await screen.findByText("タスク候補")).toBeInTheDocument();
    const header = screen.getByText("レビュー待ち").closest("div");
    expect(header?.textContent).toContain("3");
  });

  it("/review へのリンクが存在する", async () => {
    vi.mocked(api.organizations[":id"]["review-items"].$get).mockResolvedValue(
      mockJson([]),
    );
    renderDashboard();
    await screen.findByText("レビュー待ち");
    const reviewLinks = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("href") === "/review");
    expect(reviewLinks.length).toBeGreaterThan(0);
  });
});

// ===== IncompleteTasksCard =====
// render() はデフォルトモックを上書きするため、このブロックでは renderWithQuery を直接使う。

describe("Dashboard - IncompleteTasksCard", () => {
  beforeEach(() => {
    vi.mocked(useAtomValue).mockReturnValue("org-1");
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([]),
    );
    vi.mocked(api.organizations[":id"]["review-items"].$get).mockResolvedValue(
      mockJson([]),
    );
  });

  function renderDashboard() {
    return renderWithQuery(<Dashboard />);
  }

  it("タスクが空のとき「未完了のタスクはありません」が表示される", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([]));
    renderDashboard();
    expect(
      await screen.findByText("未完了のタスクはありません"),
    ).toBeInTheDocument();
  });

  it("選択中の organizationId がクエリに含まれる", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([]));
    renderDashboard();
    await screen.findByText("未完了のタスクはありません");
    expect(api.tasks.me.$get).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ organizationId: "org-1" }),
      }),
      expect.anything(),
    );
  });

  it("取得失敗時に「タスクの取得に失敗しました」が表示される", async () => {
    vi.mocked(api.tasks.me.$get).mockRejectedValue(new Error("network"));
    renderDashboard();
    expect(
      await screen.findByText("タスクの取得に失敗しました"),
    ).toBeInTheDocument();
  });

  it("タスクのタイトルと所属定例名が表示される", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(
      mockJson([
        makeTask({
          id: "t1",
          title: "議事録を作成する",
          recurringMeetings: [{ id: "rm-1", name: "週次定例" }],
        }),
      ]),
    );
    renderDashboard();
    expect(await screen.findByText("議事録を作成する")).toBeInTheDocument();
    expect(screen.getByText("週次定例")).toBeInTheDocument();
  });

  it("期限切れのタスクは「超過」テキストが表示される", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(
      // PAST は確実に過去のため overdue 判定される
      mockJson([makeTask({ id: "t1", dueDate: PAST })]),
    );
    renderDashboard();
    // カードの期限表示「N日超過」を指す。バナーの「期限超過」と区別するため /日超過/ で照合。
    expect(await screen.findByText(/日超過/)).toBeInTheDocument();
  });

  it("期限ありのタスクは「月/日」形式で表示される", async () => {
    // タイムゾーン依存を避けるため月中旬の正午UTCを使う
    vi.mocked(api.tasks.me.$get).mockResolvedValue(
      mockJson([makeTask({ id: "t1", dueDate: "2099-06-15T12:00:00.000Z" })]),
    );
    renderDashboard();
    expect(await screen.findByText("6/15")).toBeInTheDocument();
  });

  it("期限なしのタスクは「未設定」と表示される", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(
      mockJson([makeTask({ id: "t1", dueDate: null })]),
    );
    renderDashboard();
    expect(await screen.findByText("未設定")).toBeInTheDocument();
  });

  it("5件以上のとき全件スクロール表示される", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(
      mockJson(
        Array.from({ length: 5 }, (_, i) =>
          makeTask({ id: `t${i}`, title: `タスク${i + 1}` }),
        ),
      ),
    );
    renderDashboard();
    await screen.findByText("タスク1");
    expect(screen.getByText("タスク4")).toBeInTheDocument();
    expect(screen.getByText("タスク5")).toBeInTheDocument();
  });

  it("ヘッダーに件数バッジが表示される", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(
      mockJson([
        makeTask({ id: "t1", title: "タスクA" }),
        makeTask({ id: "t2", title: "タスクB" }),
      ]),
    );
    renderDashboard();
    // データ取得完了後にバッジが描画される
    await screen.findByText("タスクA");
    const header = screen.getByText("未完了タスク").closest("div");
    expect(header?.textContent).toContain("2");
  });

  it("未読タスクには未読バッジ（ボタン）が表示される", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(
      mockJson([makeTask({ id: "u1", title: "未読タスク", unread: true })]),
    );
    renderDashboard();
    expect(
      await screen.findByRole("button", { name: /未読/ }),
    ).toBeInTheDocument();
  });

  it("既読タスクには未読バッジが表示されない", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(
      mockJson([makeTask({ id: "r1", title: "既読タスク", unread: false })]),
    );
    renderDashboard();
    await screen.findByText("既読タスク");
    expect(screen.queryByRole("button", { name: /未読/ })).toBeNull();
  });

  it("未読バッジをクリックすると既読化APIが呼ばれる", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(
      mockJson([makeTask({ id: "u1", title: "未読タスク", unread: true })]),
    );
    const post = vi
      .mocked(api.tasks[":id"].read.$post)
      .mockResolvedValue(mockJson(null, 204));
    renderDashboard();
    const badge = await screen.findByRole("button", { name: /未読/ });
    fireEvent.click(badge);
    await waitFor(() => expect(post).toHaveBeenCalled());
  });
});

// ===== RemindersBanner =====

describe("Dashboard - RemindersBanner", () => {
  beforeEach(() => {
    vi.mocked(useAtomValue).mockReturnValue("org-1");
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([]),
    );
    vi.mocked(api.organizations[":id"]["review-items"].$get).mockResolvedValue(
      mockJson([]),
    );
  });

  function renderDashboard() {
    return renderWithQuery(<Dashboard />);
  }

  // now を基準にした相対日付。fake timer を避けるため Date.now() から算出する。
  const threeDaysLater = new Date(
    Date.now() + 3 * 24 * 60 * 60 * 1000,
  ).toISOString();

  it("期限超過・今週期限の件数が表示され、該当一覧へ遷移するリンクがある", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(
      mockJson([
        makeTask({ id: "o1", dueDate: PAST }),
        makeTask({ id: "w1", dueDate: threeDaysLater }),
      ]),
    );
    renderDashboard();

    const overdueLink = await screen.findByRole("link", {
      name: /期限超過/,
    });
    expect(overdueLink.textContent).toContain("1");
    expect(overdueLink).toHaveAttribute("href", "/tasks");

    const dueSoonLink = screen.getByRole("link", { name: /今週/ });
    expect(dueSoonLink.textContent).toContain("1");
    expect(dueSoonLink).toHaveAttribute("href", "/tasks");
  });

  it("未読件数も集約表示される", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(
      mockJson([makeTask({ id: "u1", unread: true })]),
    );
    renderDashboard();
    const unreadLink = await screen.findByRole("link", { name: /未読/ });
    expect(unreadLink.textContent).toContain("1");
  });

  it("リマインド対象が無いときバナーは表示されない", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([]));
    renderDashboard();
    // タスク取得完了を待ってからバナー非表示を確認する
    await screen.findByText("未完了のタスクはありません");
    expect(screen.queryByRole("link", { name: /期限超過/ })).toBeNull();
  });
});
