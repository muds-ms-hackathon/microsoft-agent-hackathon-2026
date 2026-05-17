import { TaskListWithDialogs } from "@/features/tasks/components/TaskListWithDialogs";
import type { Task, TaskListItem } from "@/features/tasks/types";
import { screen, waitFor } from "@testing-library/react";
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

const listItem: TaskListItem = {
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
};

const detail: Task = {
  ...listItem,
  assignees: [],
};

beforeEach(() => {
  vi.mocked(api.tasks[":id"].$get).mockResolvedValue(mockJson(detail));
  vi.mocked(api.tasks[":id"].$patch).mockResolvedValue(mockJson(detail));
  vi.mocked(api.tasks[":id"].$delete).mockResolvedValue(mockJson(null, 204));
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

describe("TaskListWithDialogs", () => {
  it("初期状態では詳細取得 API は呼ばれず、行は表示される", async () => {
    renderWithQuery(
      <TaskListWithDialogs tasks={[listItem]} ariaLabel="一覧" />,
    );
    expect(await screen.findByLabelText("一覧")).toBeInTheDocument();
    expect(screen.getByText("資料作成")).toBeInTheDocument();
    expect(api.tasks[":id"].$get).not.toHaveBeenCalled();
  });

  it("行クリックで GET /tasks/:id が呼ばれ、EditTaskDialog が開く", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <TaskListWithDialogs tasks={[listItem]} ariaLabel="一覧" />,
    );

    await user.click(
      await screen.findByRole("button", { name: /タスク 資料作成/ }),
    );

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

  it("Edit 内の削除ボタン → DeleteTaskDialog が開く（Edit は非表示に）", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <TaskListWithDialogs tasks={[listItem]} ariaLabel="一覧" />,
    );

    await user.click(
      await screen.findByRole("button", { name: /タスク 資料作成/ }),
    );
    await screen.findByRole("heading", { name: "タスクを編集" });

    await user.click(screen.getByRole("button", { name: "削除" }));

    // DeleteTaskDialog のヘッダが見える
    expect(
      await screen.findByRole("heading", { name: "タスクを削除" }),
    ).toBeInTheDocument();
  });

  it("削除実行で DELETE が呼ばれ、両ダイアログが閉じる", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <TaskListWithDialogs tasks={[listItem]} ariaLabel="一覧" />,
    );

    await user.click(
      await screen.findByRole("button", { name: /タスク 資料作成/ }),
    );
    await screen.findByRole("heading", { name: "タスクを編集" });
    await user.click(screen.getByRole("button", { name: "削除" }));
    await screen.findByRole("heading", { name: "タスクを削除" });
    await user.click(screen.getByRole("button", { name: "削除を実行" }));

    await waitFor(() => {
      expect(api.tasks[":id"].$delete).toHaveBeenCalled();
    });
    // 両ダイアログが閉じる
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "タスクを編集" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "タスクを削除" }),
      ).not.toBeInTheDocument();
    });
  });

  it("詳細取得失敗時はエラーバナーと再試行ボタンが出る", async () => {
    vi.mocked(api.tasks[":id"].$get).mockResolvedValue(
      mockJson({ error: "err" }, 500),
    );
    const user = userEvent.setup();
    renderWithQuery(
      <TaskListWithDialogs tasks={[listItem]} ariaLabel="一覧" />,
    );

    await user.click(
      await screen.findByRole("button", { name: /タスク 資料作成/ }),
    );

    expect(
      await screen.findByText("タスク詳細の取得に失敗しました"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });
});
