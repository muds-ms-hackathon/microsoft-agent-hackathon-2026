import type { MeetingListItem } from "@/features/recurring-meetings/hooks/useRecurringMeetingMeetings";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    "recurring-meetings": {
      ":id": {
        $get: vi.fn(),
        meetings: {
          $get: vi.fn(),
          $post: vi.fn(),
        },
        tasks: {
          $get: vi.fn(),
        },
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

// Link は RouterProvider 配下でないと useRouter で落ちる。
// 既存 sidebar.test と同じく href を持つ <a> として描画するモックに差し替える。
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

import { api } from "@/lib/api";
import { RecurringMeetingDetailView } from "../routes/recurring-meetings.$id";

function mockJson<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as never;
}

const detail = {
  id: "rmtg-1",
  organizationId: "org-1",
  name: "週次定例",
  description: "毎週月曜の進捗共有",
  scheduleCron: "0 10 * * 1",
  defaultDurationMinutes: 60,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  members: [],
};

const meetings: MeetingListItem[] = [
  {
    id: "mtg-future-1",
    title: "週次定例 2026-05-20",
    heldAt: "2026-05-20T01:00:00.000Z",
    estimatedDurationMinutes: 60,
    recurringMeetingId: "rmtg-1",
  },
  {
    id: "mtg-future-2",
    title: "週次定例 2026-05-27",
    heldAt: "2026-05-27T01:00:00.000Z",
    estimatedDurationMinutes: 90,
    recurringMeetingId: "rmtg-1",
  },
  {
    id: "mtg-past-1",
    title: "週次定例 2026-05-13",
    heldAt: "2026-05-13T01:00:00.000Z",
    estimatedDurationMinutes: 60,
    recurringMeetingId: "rmtg-1",
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

// partitionMeetings の「現在時刻」を固定するため、now を props で注入する。
// fake timer は TanStack Query 内部と相性が悪いため使わない。
const NOW = new Date("2026-05-17T00:00:00Z");

function render(opts?: { id?: string }) {
  return renderWithQuery(
    <RecurringMeetingDetailView id={opts?.id ?? "rmtg-1"} now={NOW} />,
  );
}

describe("定例詳細ページ - ヘッダ表示", () => {
  beforeEach(() => {
    vi.mocked(api["recurring-meetings"][":id"].$get).mockResolvedValue(
      mockJson(detail),
    );
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson([]),
    );
    vi.mocked(api["recurring-meetings"][":id"].tasks.$get).mockResolvedValue(
      mockJson([]),
    );
  });

  it("定例名・説明・cron 人間表記・デフォルト所要時間を表示する", async () => {
    render();
    expect(await screen.findByText("週次定例")).toBeInTheDocument();
    expect(screen.getByText("毎週月曜の進捗共有")).toBeInTheDocument();
    // cron は describeCron で人間表記される。月曜は "月" 表示
    expect(screen.getByText(/毎週 月 10:00/)).toBeInTheDocument();
    expect(screen.getByText("デフォルト 60 分")).toBeInTheDocument();
  });

  it("組織詳細への戻るリンクが存在する", async () => {
    render();
    expect(
      await screen.findByRole("link", { name: /組織詳細に戻る/ }),
    ).toBeInTheDocument();
  });

  it("定例取得失敗時はエラー表示にフォールバックする", async () => {
    vi.mocked(api["recurring-meetings"][":id"].$get).mockRejectedValue(
      new Error("network"),
    );
    render();
    expect(
      await screen.findByText("定例の取得に失敗しました"),
    ).toBeInTheDocument();
  });
});

describe("定例詳細ページ - 会議のセクション分け", () => {
  beforeEach(() => {
    vi.mocked(api["recurring-meetings"][":id"].$get).mockResolvedValue(
      mockJson(detail),
    );
    vi.mocked(api["recurring-meetings"][":id"].tasks.$get).mockResolvedValue(
      mockJson([]),
    );
  });

  it("未来の会議は「今後の会議」に昇順、過去の会議は「過去の会議」に降順で表示される", async () => {
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson(meetings),
    );

    render();

    const upcoming = await screen.findByRole("list", {
      name: "今後の会議一覧",
    });
    const upcomingTitles = within(upcoming)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(upcomingTitles[0]).toContain("週次定例 2026-05-20");
    expect(upcomingTitles[1]).toContain("週次定例 2026-05-27");

    const past = await screen.findByRole("list", { name: "過去の会議一覧" });
    const pastTitles = within(past)
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "");
    expect(pastTitles[0]).toContain("週次定例 2026-05-13");
  });

  it("会議カードに所要時間が表示される", async () => {
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson(meetings),
    );

    render();
    const upcoming = await screen.findByRole("list", {
      name: "今後の会議一覧",
    });
    const firstCard = within(upcoming).getAllByRole("listitem")[0];
    // 未来 1 件目は 60 分のはず
    expect(within(firstCard).getByText("60 分")).toBeInTheDocument();
  });

  it("未来 0 件のとき「予定はまだありません」を表示する", async () => {
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson(meetings.filter((m) => m.id === "mtg-past-1")),
    );

    render();
    expect(await screen.findByText("予定はまだありません")).toBeInTheDocument();
  });

  it("過去 0 件のとき「過去の開催はまだありません」を表示する", async () => {
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson(meetings.filter((m) => m.id.startsWith("mtg-future"))),
    );

    render();
    expect(
      await screen.findByText("過去の開催はまだありません"),
    ).toBeInTheDocument();
  });

  it("会議 0 件のときも両セクションが描画される", async () => {
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson([]),
    );

    render();
    expect(await screen.findByText("予定はまだありません")).toBeInTheDocument();
    expect(screen.getByText("過去の開催はまだありません")).toBeInTheDocument();
  });

  it("「会議を追加」ボタンを押すとダイアログが開き、defaultDurationMinutes が初期値になる", async () => {
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson([]),
    );
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: "会議を追加" }));
    const dialog = await screen.findByRole("dialog", { name: "会議を追加" });
    // 既定で 60 分プリセットがアクティブ（aria-checked="true"）
    const preset60 = within(dialog).getByRole("radio", { name: "60 分" });
    expect(preset60).toHaveAttribute("aria-checked", "true");
  });

  it("会議を追加して POST が呼ばれる", async () => {
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson([]),
    );
    vi.mocked(
      api["recurring-meetings"][":id"].meetings.$post,
    ).mockResolvedValue(
      mockJson(
        {
          id: "mtg-new",
          title: "新規会議",
          heldAt: "2026-05-20T01:00:00.000Z",
          estimatedDurationMinutes: 60,
          recurringMeetingId: "rmtg-1",
        },
        201,
      ),
    );
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: "会議を追加" }));
    const dialog = await screen.findByRole("dialog", { name: "会議を追加" });
    await user.type(within(dialog).getByLabelText("タイトル"), "新規会議");
    // datetime-local の値は "YYYY-MM-DDTHH:mm" 形式。fireEvent.change を使う方が
    // jsdom 上で安定するが、userEvent.type でも入力できる。
    const heldAtInput = within(dialog).getByLabelText("開催日時");
    await user.type(heldAtInput, "2026-05-20T10:00");
    await user.click(within(dialog).getByRole("button", { name: "追加" }));
    await waitFor(() => {
      expect(
        api["recurring-meetings"][":id"].meetings.$post,
      ).toHaveBeenCalled();
    });
    // ペイロード検証: title / estimatedDurationMinutes は確実な値、
    // heldAt はローカル時刻からの ISO 変換なのでテスト環境タイムゾーン依存になり得るが、
    // ISO8601 文字列であることだけ確認する。
    const call = vi.mocked(api["recurring-meetings"][":id"].meetings.$post).mock
      .calls[0];
    expect(call[0]).toMatchObject({
      param: { id: "rmtg-1" },
      json: {
        title: "新規会議",
        estimatedDurationMinutes: 60,
      },
    });
    expect((call[0] as { json: { heldAt: string } }).json.heldAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it("会議取得だけ失敗した場合はエラー表示し、ヘッダは残る", async () => {
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockRejectedValue(
      new Error("network"),
    );

    render();
    expect(await screen.findByText("週次定例")).toBeInTheDocument();
    expect(
      await screen.findByText("会議一覧の取得に失敗しました"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "今後の会議一覧" }),
    ).not.toBeInTheDocument();
  });
});

describe("定例詳細ページ - タスクセクション", () => {
  const sampleTask = {
    id: "task-1",
    organizationId: "org-1",
    originMeetingId: null,
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
    originMeeting: null,
    assignees: [],
    recurringMeetings: [{ id: "rmtg-1", name: "週次定例" }],
  };

  beforeEach(() => {
    vi.mocked(api["recurring-meetings"][":id"].$get).mockResolvedValue(
      mockJson(detail),
    );
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson([]),
    );
  });

  function renderWithSearch(opts?: {
    search?: { status?: string };
    onSearchChange?: (next: { status?: string }) => void;
  }) {
    return renderWithQuery(
      <RecurringMeetingDetailView
        id="rmtg-1"
        now={NOW}
        search={opts?.search ?? {}}
        onSearchChange={opts?.onSearchChange ?? (() => {})}
      />,
    );
  }

  it("タスクを 1 件取得して表示する", async () => {
    vi.mocked(api["recurring-meetings"][":id"].tasks.$get).mockResolvedValue(
      mockJson([sampleTask]),
    );
    renderWithSearch();
    expect(await screen.findByText("タスク")).toBeInTheDocument();
    const list = await screen.findByLabelText("プロジェクトのタスク一覧");
    expect(within(list).getByText("資料作成")).toBeInTheDocument();
  });

  it("0 件時は空状態メッセージと disabled の「タスクを追加」ボタンを表示する", async () => {
    vi.mocked(api["recurring-meetings"][":id"].tasks.$get).mockResolvedValue(
      mockJson([]),
    );
    renderWithSearch();
    expect(
      await screen.findByText("このプロジェクトのタスクはまだありません"),
    ).toBeInTheDocument();
    const addBtn = screen.getByRole("button", { name: "タスクを追加" });
    expect(addBtn).toBeDisabled();
  });

  it("status チェックボックスを切り替えると onSearchChange が呼ばれる", async () => {
    vi.mocked(api["recurring-meetings"][":id"].tasks.$get).mockResolvedValue(
      mockJson([]),
    );
    const onSearchChange = vi.fn();
    renderWithSearch({ onSearchChange });

    await screen.findByText("タスク");
    const checkbox = screen.getByLabelText(/未着手/);
    await userEvent.click(checkbox);
    expect(onSearchChange).toHaveBeenCalledWith({ status: "todo" });
  });

  it("初期 status フィルタが反映される", async () => {
    vi.mocked(api["recurring-meetings"][":id"].tasks.$get).mockResolvedValue(
      mockJson([]),
    );
    renderWithSearch({ search: { status: "in_progress" } });
    await screen.findByText("タスク");

    // API 呼び出しの query.status に in_progress が乗ること
    const call = vi.mocked(api["recurring-meetings"][":id"].tasks.$get).mock
      .calls[0];
    expect((call[0] as { query: { status?: string } }).query.status).toBe(
      "in_progress",
    );
  });

  it("タスク取得失敗時はエラーメッセージを表示する（定例ヘッダは維持）", async () => {
    vi.mocked(api["recurring-meetings"][":id"].tasks.$get).mockRejectedValue(
      new Error("network"),
    );
    renderWithSearch();
    expect(await screen.findByText("週次定例")).toBeInTheDocument();
    expect(
      await screen.findByText("タスクの取得に失敗しました"),
    ).toBeInTheDocument();
  });
});
