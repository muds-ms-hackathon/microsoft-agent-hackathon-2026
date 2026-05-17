import type { TaskListItem } from "@/features/tasks/types";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    tasks: {
      me: { $get: vi.fn() },
      // CreateTaskDialog から呼ばれる可能性があるエンドポイントを抑止する。
      // 本テストはダイアログを開かないが、Picker の useQuery が
      // ダイアログ mount 時に走る可能性があるため最低限のスタブを用意する。
      $post: vi.fn(),
      ":id": { $get: vi.fn(), $patch: vi.fn(), $delete: vi.fn() },
    },
    organizations: {
      ":id": {
        members: { $get: vi.fn() },
        meetings: { $get: vi.fn() },
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

// Link / createFileRoute は RouterProvider 配下でないと落ちる。
// 既存テスト群と同じパターンで差し替える。
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    createFileRoute: () => () => ({}),
  };
});

import { api } from "@/lib/api";
import { MyTasksView } from "../routes/tasks.index";

function mockJson<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as never;
}

const baseTask: TaskListItem = {
  id: "task-1",
  organizationId: "org-1",
  originMeetingId: null,
  decisionItemId: null,
  title: "資料作成",
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
  createdAt: "2026-05-17T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z",
  organization: { id: "org-1", name: "ACME" },
  originMeeting: null,
  assignees: [{ id: "user-1", name: "alice", displayName: "alice" }],
  recurringMeetings: [{ id: "rmtg-1", name: "週次定例" }],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MyTasksView", () => {
  it("タスク 1 件を行として表示する", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([baseTask]));

    renderWithQuery(<MyTasksView search={{}} onSearchChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByLabelText("My タスク一覧")).toBeInTheDocument();
    });
    const list = screen.getByLabelText("My タスク一覧");
    expect(within(list).getByText("資料作成")).toBeInTheDocument();
    expect(within(list).getByText(/ACME/)).toBeInTheDocument();
  });

  it("0 件時は空状態メッセージを表示する", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([]));

    renderWithQuery(<MyTasksView search={{}} onSearchChange={() => {}} />);

    await waitFor(() => {
      expect(
        screen.getByText("担当中のタスクはありません"),
      ).toBeInTheDocument();
    });
  });

  it("status チェックボックスをクリックすると onSearchChange に文字列で渡る", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([]));
    const onSearchChange = vi.fn();

    renderWithQuery(
      <MyTasksView search={{}} onSearchChange={onSearchChange} />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("担当中のタスクはありません"),
      ).toBeInTheDocument(),
    );

    // 「未着手」ラベルのチェックボックスを切り替える
    await userEvent.click(screen.getByLabelText(/未着手/));

    expect(onSearchChange).toHaveBeenCalledWith({ status: "todo" });
  });

  it("組織フィルタで指定組織のタスクのみ表示される", async () => {
    const taskOrg1 = {
      ...baseTask,
      id: "t1",
      organization: { id: "org-1", name: "ACME" },
    };
    const taskOrg2 = {
      ...baseTask,
      id: "t2",
      title: "別組織のタスク",
      organization: { id: "org-2", name: "Beta" },
    };
    vi.mocked(api.tasks.me.$get).mockResolvedValue(
      mockJson([taskOrg1, taskOrg2]),
    );

    renderWithQuery(
      <MyTasksView search={{ orgId: "org-1" }} onSearchChange={() => {}} />,
    );

    await waitFor(() => {
      expect(screen.getByText("資料作成")).toBeInTheDocument();
    });
    expect(screen.queryByText("別組織のタスク")).not.toBeInTheDocument();
  });

  it("期限超過タスクは destructive クラスで強調表示される", async () => {
    const overdueTask = {
      ...baseTask,
      id: "t-over",
      title: "期限切れタスク",
      dueDate: "2026-05-10T00:00:00.000Z",
      status: "todo" as const,
    };
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([overdueTask]));

    renderWithQuery(
      <MyTasksView
        search={{}}
        onSearchChange={() => {}}
        now={new Date("2026-05-17T00:00:00Z")}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("期限切れタスク")).toBeInTheDocument();
    });
    const dateLabel = screen.getByTestId("task-dates");
    expect(dateLabel.className).toMatch(/text-destructive/);
  });

  it("done のタスクは期限切れでも強調されない", async () => {
    const doneTask = {
      ...baseTask,
      id: "t-done",
      title: "完了済み",
      dueDate: "2026-05-10T00:00:00.000Z",
      status: "done" as const,
    };
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([doneTask]));

    renderWithQuery(
      <MyTasksView
        search={{}}
        onSearchChange={() => {}}
        now={new Date("2026-05-17T00:00:00Z")}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("完了済み")).toBeInTheDocument();
    });
    const dateLabel = screen.getByTestId("task-dates");
    expect(dateLabel.className).not.toMatch(/text-destructive/);
  });

  it("status 文字列フィルタは API リクエストに含まれる", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([]));

    renderWithQuery(
      <MyTasksView
        search={{ status: "todo,in_progress" }}
        onSearchChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(api.tasks.me.$get).toHaveBeenCalled();
    });
    const call = vi.mocked(api.tasks.me.$get).mock.calls[0];
    expect((call[0] as { query: { status?: string } }).query.status).toBe(
      "todo,in_progress",
    );
  });

  it("読み込み中はインジケータを表示する", () => {
    // 解決しない Promise を返してローディング状態を維持
    vi.mocked(api.tasks.me.$get).mockReturnValue(
      new Promise(() => {}) as never,
    );

    renderWithQuery(<MyTasksView search={{}} onSearchChange={() => {}} />);

    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
  });
});

describe("MyTasksView - TaskRow 詳細", () => {
  it("attached 定例は全件タグとして列挙される（+N 省略をやめた）", async () => {
    const multiRm = {
      ...baseTask,
      recurringMeetings: [
        { id: "rmtg-1", name: "週次定例" },
        { id: "rmtg-2", name: "月次定例" },
        { id: "rmtg-3", name: "臨時会" },
      ],
    };
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([multiRm]));

    renderWithQuery(<MyTasksView search={{}} onSearchChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("週次定例")).toBeInTheDocument();
    });
    expect(screen.getByText("月次定例")).toBeInTheDocument();
    expect(screen.getByText("臨時会")).toBeInTheDocument();
    expect(screen.getAllByTestId("task-recurring-tag")).toHaveLength(3);
  });

  it("担当者はアバタースタックで表示される（イニシャル + +N）", async () => {
    const manyAssignees = {
      ...baseTask,
      assignees: [
        { id: "user-1", name: "alice", displayName: "Alice" },
        { id: "user-2", name: "bob", displayName: "Bob" },
        { id: "user-3", name: "charlie", displayName: "Charlie" },
        { id: "user-4", name: "dave", displayName: "Dave" },
        { id: "user-5", name: "eve", displayName: "Eve" },
      ],
    };
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([manyAssignees]));

    renderWithQuery(<MyTasksView search={{}} onSearchChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId("task-assignee-avatars")).toBeInTheDocument();
    });
    const stack = screen.getByTestId("task-assignee-avatars");
    // 最大 4 件まで表示、5 件目以降は +1
    expect(stack).toHaveTextContent("A");
    expect(stack).toHaveTextContent("B");
    expect(stack).toHaveTextContent("C");
    expect(stack).toHaveTextContent("D");
    expect(stack).toHaveTextContent("+1");
  });

  it("startDate と dueDate が両方ある時は両方表示される", async () => {
    const withDates = {
      ...baseTask,
      startDate: "2026-05-15T00:00:00.000Z",
      dueDate: "2026-05-20T00:00:00.000Z",
    };
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([withDates]));

    renderWithQuery(<MyTasksView search={{}} onSearchChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId("task-dates")).toBeInTheDocument();
    });
    const dates = screen.getByTestId("task-dates");
    expect(dates).toHaveTextContent("着手 5/15");
    expect(dates).toHaveTextContent("期日 5/20");
  });

  it("startDate も dueDate も無い時は '—' を表示する", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([baseTask]));

    renderWithQuery(<MyTasksView search={{}} onSearchChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId("task-dates")).toHaveTextContent("—");
    });
  });

  it("行はクリック可能（編集ダイアログ起動の準備済み、共通ラッパー経由）", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([baseTask]));

    renderWithQuery(<MyTasksView search={{}} onSearchChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("資料作成")).toBeInTheDocument();
    });
    // TaskListWithDialogs の onClick が紐付くため disabled ではない。
    // ダイアログ起動自体は TaskListWithDialogs の専用テストでカバー。
    const row = screen.getByRole("button", { name: /タスク 資料作成/ });
    expect(row).not.toBeDisabled();
  });
});

describe("MyTasksView - currentOrgId 初期フィルタ", () => {
  it("URL に orgId が無いとき currentOrgId でフィルタされる", async () => {
    const t1 = {
      ...baseTask,
      id: "t1",
      organization: { id: "org-1", name: "ACME" },
    };
    const t2 = {
      ...baseTask,
      id: "t2",
      title: "別組織のタスク",
      organization: { id: "org-2", name: "Beta" },
    };
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([t1, t2]));

    renderWithQuery(
      <MyTasksView
        search={{}}
        onSearchChange={() => {}}
        currentOrgId="org-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("My タスク一覧")).toBeInTheDocument();
    });
    const list = screen.getByLabelText("My タスク一覧");
    expect(within(list).getByText("資料作成")).toBeInTheDocument();
    expect(within(list).queryByText("別組織のタスク")).not.toBeInTheDocument();
  });

  it("URL の orgId は currentOrgId より優先される", async () => {
    const t1 = {
      ...baseTask,
      id: "t1",
      organization: { id: "org-1", name: "ACME" },
    };
    const t2 = {
      ...baseTask,
      id: "t2",
      title: "別組織のタスク",
      organization: { id: "org-2", name: "Beta" },
    };
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([t1, t2]));

    renderWithQuery(
      <MyTasksView
        search={{ orgId: "org-2" }}
        onSearchChange={() => {}}
        currentOrgId="org-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("別組織のタスク")).toBeInTheDocument();
    });
    expect(screen.queryByText("資料作成")).not.toBeInTheDocument();
  });

  it("URL の orgId=all は currentOrgId を無視してフィルタ解除", async () => {
    const t1 = {
      ...baseTask,
      id: "t1",
      organization: { id: "org-1", name: "ACME" },
    };
    const t2 = {
      ...baseTask,
      id: "t2",
      title: "別組織のタスク",
      organization: { id: "org-2", name: "Beta" },
    };
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([t1, t2]));

    renderWithQuery(
      <MyTasksView
        search={{ orgId: "all" }}
        onSearchChange={() => {}}
        currentOrgId="org-1"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("資料作成")).toBeInTheDocument();
    });
    expect(screen.getByText("別組織のタスク")).toBeInTheDocument();
  });

  it("currentOrgId が null なら従来通り全件表示", async () => {
    const t1 = {
      ...baseTask,
      id: "t1",
      organization: { id: "org-1", name: "ACME" },
    };
    const t2 = {
      ...baseTask,
      id: "t2",
      title: "別組織のタスク",
      organization: { id: "org-2", name: "Beta" },
    };
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([t1, t2]));

    renderWithQuery(
      <MyTasksView search={{}} onSearchChange={() => {}} currentOrgId={null} />,
    );

    await waitFor(() => {
      expect(screen.getByText("資料作成")).toBeInTheDocument();
    });
    expect(screen.getByText("別組織のタスク")).toBeInTheDocument();
  });

  it("select で「すべて」を選ぶと URL に orgId=all がセットされる", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([]));
    const onSearchChange = vi.fn();

    renderWithQuery(
      <MyTasksView
        search={{}}
        onSearchChange={onSearchChange}
        currentOrgId="org-1"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("担当中のタスクはありません"),
      ).toBeInTheDocument(),
    );

    const select = screen.getByLabelText("組織フィルタ") as HTMLSelectElement;
    await userEvent.selectOptions(select, "all");

    expect(onSearchChange).toHaveBeenCalledWith({ orgId: "all" });
  });
});

describe("MyTasksView - フィルタ整合", () => {
  it("status を既に持っていてもう一度同じものを押すと外す（解除）", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([]));
    const onSearchChange = vi.fn();

    renderWithQuery(
      <MyTasksView
        search={{ status: "todo" }}
        onSearchChange={onSearchChange}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText("担当中のタスクはありません"),
      ).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByLabelText(/未着手/));
    // status をクリアして undefined にする
    expect(onSearchChange).toHaveBeenCalledWith({ status: undefined });
  });

  it("組織フィルタは取得結果のユニーク組織から構築される", async () => {
    const t1 = {
      ...baseTask,
      id: "t1",
      organization: { id: "org-1", name: "ACME" },
    };
    const t2 = {
      ...baseTask,
      id: "t2",
      organization: { id: "org-2", name: "Beta" },
    };
    const t3 = {
      ...baseTask,
      id: "t3",
      organization: { id: "org-1", name: "ACME" },
    };
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([t1, t2, t3]));

    renderWithQuery(<MyTasksView search={{}} onSearchChange={() => {}} />);

    // データロードを待ってから options を取り出す（初回 render では空配列で
    // select に「すべて」しか入っていないため）
    await waitFor(() => {
      expect(screen.getByLabelText("My タスク一覧")).toBeInTheDocument();
    });
    const select = screen.getByLabelText("組織フィルタ");
    const options = within(select).getAllByRole("option");
    // "すべて" + ACME + Beta = 3
    expect(options).toHaveLength(3);
    expect(options[1]).toHaveTextContent("ACME");
    expect(options[2]).toHaveTextContent("Beta");
  });
});

describe("MyTasksView - View 切替", () => {
  it("デフォルト (view 未指定) では List 表示", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([baseTask]));
    renderWithQuery(<MyTasksView search={{}} onSearchChange={() => {}} />);
    expect(await screen.findByLabelText("My タスク一覧")).toBeInTheDocument();
    expect(screen.queryByTestId("kanban-board")).not.toBeInTheDocument();
  });

  it("view=kanban で KanbanBoard が描画される", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([baseTask]));
    renderWithQuery(
      <MyTasksView search={{ view: "kanban" }} onSearchChange={() => {}} />,
    );
    expect(await screen.findByTestId("kanban-board")).toBeInTheDocument();
    expect(screen.queryByLabelText("My タスク一覧")).not.toBeInTheDocument();
  });

  it("ViewToggle で kanban を選ぶと onSearchChange に view=kanban が渡る", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([baseTask]));
    const onSearchChange = vi.fn();
    renderWithQuery(
      <MyTasksView search={{}} onSearchChange={onSearchChange} />,
    );

    await screen.findByLabelText("My タスク一覧");
    await userEvent.click(screen.getByRole("tab", { name: /Kanban/ }));

    expect(onSearchChange).toHaveBeenCalledWith(
      expect.objectContaining({ view: "kanban" }),
    );
  });
});

describe("MyTasksView - タスク作成 CTA", () => {
  it("currentOrgId ありなら「タスクを追加」ボタンが有効になる", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([baseTask]));

    renderWithQuery(
      <MyTasksView
        search={{}}
        onSearchChange={() => {}}
        currentOrgId="org-1"
      />,
    );

    // ヘッダ右の CTA。リスト表示後でも常に出ているので findAll で取って先頭を見る。
    const buttons = await screen.findAllByRole("button", {
      name: "タスクを追加",
    });
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b).not.toBeDisabled();
  });

  it("currentOrgId が null なら「タスクを追加」ボタンは disabled", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([baseTask]));

    renderWithQuery(
      <MyTasksView search={{}} onSearchChange={() => {}} currentOrgId={null} />,
    );

    const buttons = await screen.findAllByRole("button", {
      name: "タスクを追加",
    });
    for (const b of buttons) expect(b).toBeDisabled();
  });

  it("0 件時は空状態メッセージの下に「タスクを追加」CTA が出る", async () => {
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([]));

    renderWithQuery(
      <MyTasksView
        search={{}}
        onSearchChange={() => {}}
        currentOrgId="org-1"
      />,
    );

    await screen.findByText("担当中のタスクはありません");
    // 空状態時は「ヘッダ CTA」+「空状態 CTA」の 2 つが表示される。
    const buttons = screen.getAllByRole("button", { name: "タスクを追加" });
    expect(buttons).toHaveLength(2);
    for (const b of buttons) expect(b).not.toBeDisabled();
  });
});
