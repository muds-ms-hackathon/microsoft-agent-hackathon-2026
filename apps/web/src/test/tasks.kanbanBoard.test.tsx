import { KanbanBoard } from "@/features/tasks/components/KanbanBoard";
import type { Task, TaskListItem } from "@/features/tasks/types";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    tasks: {
      ":id": {
        $get: vi.fn(),
        $patch: vi.fn(),
        $delete: vi.fn(),
      },
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

import { api } from "@/lib/api";

function mockJson<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as never;
}

function listItem(overrides: Partial<TaskListItem>): TaskListItem {
  return {
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
    assignees: [],
    recurringMeetings: [],
    ...overrides,
  };
}

const detail: Task = { ...listItem({}), assignees: [] };

beforeEach(() => {
  vi.mocked(api.tasks[":id"].$get).mockResolvedValue(mockJson(detail));
  vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
    mockJson([]),
  );
  vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
    mockJson([]),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("KanbanBoard", () => {
  it("4 列が描画される（todo / in_progress / done / rejected）", () => {
    renderWithQuery(
      <KanbanBoard
        tasks={[]}
        queryKey={["tasks", "me", {}]}
        ariaLabel="ボード"
      />,
    );
    expect(screen.getByTestId("kanban-column-todo")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-in_progress")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-done")).toBeInTheDocument();
    expect(screen.getByTestId("kanban-column-rejected")).toBeInTheDocument();
  });

  it("タスクが status に従って正しい列に配置される", () => {
    const tasks = [
      listItem({ id: "t1", title: "未着手のタスク", status: "todo" }),
      listItem({ id: "t2", title: "進行中のタスク", status: "in_progress" }),
      listItem({ id: "t3", title: "完了のタスク", status: "done" }),
    ];
    renderWithQuery(
      <KanbanBoard
        tasks={tasks}
        queryKey={["tasks", "me", {}]}
        ariaLabel="ボード"
      />,
    );

    const todoCol = screen.getByTestId("kanban-column-todo");
    expect(within(todoCol).getByText("未着手のタスク")).toBeInTheDocument();

    const inProgressCol = screen.getByTestId("kanban-column-in_progress");
    expect(
      within(inProgressCol).getByText("進行中のタスク"),
    ).toBeInTheDocument();

    const doneCol = screen.getByTestId("kanban-column-done");
    expect(within(doneCol).getByText("完了のタスク")).toBeInTheDocument();
  });

  it("AI 専用 status (draft/reviewing) のタスクは表示されない", () => {
    const tasks = [
      listItem({ id: "ai1", title: "AI 提案中", status: "draft" }),
      listItem({ id: "ai2", title: "レビュー中", status: "reviewing" }),
    ];
    renderWithQuery(
      <KanbanBoard
        tasks={tasks}
        queryKey={["tasks", "me", {}]}
        ariaLabel="ボード"
      />,
    );
    expect(screen.queryByText("AI 提案中")).not.toBeInTheDocument();
    expect(screen.queryByText("レビュー中")).not.toBeInTheDocument();
  });

  it("空列には「タスクなし」が表示される", () => {
    renderWithQuery(
      <KanbanBoard
        tasks={[listItem({ id: "t1", status: "todo" })]}
        queryKey={["tasks", "me", {}]}
        ariaLabel="ボード"
      />,
    );
    const inProgressCol = screen.getByTestId("kanban-column-in_progress");
    expect(within(inProgressCol).getByText("タスクなし")).toBeInTheDocument();
  });

  it("カードをクリックすると詳細取得 → EditTaskDialog が開く", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <KanbanBoard
        tasks={[listItem({ id: "task-1", title: "資料作成", status: "todo" })]}
        queryKey={["tasks", "me", {}]}
        ariaLabel="ボード"
      />,
    );

    const card = screen.getByTestId("kanban-card");
    await user.click(card);

    await waitFor(() => {
      expect(api.tasks[":id"].$get).toHaveBeenCalledWith(
        { param: { id: "task-1" } },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
    expect(
      await screen.findByRole("heading", { name: "タスクを編集" }),
    ).toBeInTheDocument();
  });

  it("件数表示が列ヘッダに出る", () => {
    const tasks = [
      listItem({ id: "t1", status: "todo" }),
      listItem({ id: "t2", status: "todo" }),
      listItem({ id: "t3", status: "in_progress" }),
    ];
    renderWithQuery(
      <KanbanBoard
        tasks={tasks}
        queryKey={["tasks", "me", {}]}
        ariaLabel="ボード"
      />,
    );
    const todoCol = screen.getByTestId("kanban-column-todo");
    // ヘッダの件数表示。列の最初の数字。
    expect(within(todoCol).getByText("2")).toBeInTheDocument();
  });
});
