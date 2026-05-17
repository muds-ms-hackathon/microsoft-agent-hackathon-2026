import type { TaskListItem } from "@/features/tasks/types";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    tasks: {
      me: { $get: vi.fn() },
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
    const dueLabel = screen.getByTestId("task-due-date");
    expect(dueLabel.className).toMatch(/text-destructive/);
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
    const dueLabel = screen.getByTestId("task-due-date");
    expect(dueLabel.className).not.toMatch(/text-destructive/);
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
  it("attached 定例が複数あれば +N で表示する", async () => {
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
      expect(screen.getByText(/週次定例 \+2/)).toBeInTheDocument();
    });
  });

  it("担当者数を 'N名' で表示する", async () => {
    const twoAssignees = {
      ...baseTask,
      assignees: [
        { id: "user-1", name: "alice", displayName: "alice" },
        { id: "user-2", name: "bob", displayName: "bob" },
      ],
    };
    vi.mocked(api.tasks.me.$get).mockResolvedValue(mockJson([twoAssignees]));

    renderWithQuery(<MyTasksView search={{}} onSearchChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByTestId("task-assignee-count")).toBeInTheDocument();
    });
    expect(screen.getByTestId("task-assignee-count")).toHaveTextContent("2名");
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
