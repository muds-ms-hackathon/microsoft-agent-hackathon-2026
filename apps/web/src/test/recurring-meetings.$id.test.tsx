import type { MeetingListItem } from "@/features/recurring-meetings/hooks/useRecurringMeetingMeetings";
import { screen, within } from "@testing-library/react";
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
