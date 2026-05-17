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

// Link / createFileRoute は RouterProvider 配下でないと落ちる。
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
import { MeetingDetailView } from "../routes/meetings.$id";

function mockJson<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as never;
}

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
});
