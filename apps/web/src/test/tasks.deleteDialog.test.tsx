import { DeleteTaskDialog } from "@/features/tasks/components/DeleteTaskDialog";
import type { Task } from "@/features/tasks/types";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    tasks: {
      ":id": {
        $delete: vi.fn(),
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

import { api } from "@/lib/api";

import { mockJson } from "./helpers/mockJson";

const task: Task = {
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

beforeEach(() => {
  vi.mocked(api.tasks[":id"].$delete).mockResolvedValue(mockJson(null, 204));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DeleteTaskDialog", () => {
  it("タイトルが確認文に表示される", async () => {
    renderWithQuery(
      <DeleteTaskDialog task={task} open onOpenChange={() => {}} />,
    );
    expect(
      await screen.findByText(/「資料作成」を削除しますか？/),
    ).toBeInTheDocument();
  });

  it("「削除を実行」で DELETE が呼ばれ onDeleted が発火する", async () => {
    const onOpenChange = vi.fn();
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <DeleteTaskDialog
        task={task}
        open
        onOpenChange={onOpenChange}
        onDeleted={onDeleted}
      />,
    );

    await user.click(screen.getByRole("button", { name: "削除を実行" }));

    await waitFor(() => {
      expect(api.tasks[":id"].$delete).toHaveBeenCalledWith(
        { param: { id: "task-1" } },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("「キャンセル」では DELETE は呼ばれず onOpenChange(false) のみ", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <DeleteTaskDialog task={task} open onOpenChange={onOpenChange} />,
    );

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(api.tasks[":id"].$delete).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("API 失敗時はエラーメッセージを表示し onDeleted は呼ばれない", async () => {
    vi.mocked(api.tasks[":id"].$delete).mockResolvedValue(
      mockJson({ error: "bad" }, 500),
    );
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <DeleteTaskDialog
        task={task}
        open
        onOpenChange={() => {}}
        onDeleted={onDeleted}
      />,
    );

    await user.click(screen.getByRole("button", { name: "削除を実行" }));
    expect(
      await screen.findByText("タスクの削除に失敗しました"),
    ).toBeInTheDocument();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
