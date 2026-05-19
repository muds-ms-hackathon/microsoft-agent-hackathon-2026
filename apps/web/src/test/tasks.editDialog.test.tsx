import { EditTaskDialog } from "@/features/tasks/components/EditTaskDialog";
import type { Task } from "@/features/tasks/types";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    organizations: {
      ":id": {
        members: { $get: vi.fn() },
        meetings: { $get: vi.fn() },
      },
    },
    tasks: {
      ":id": {
        $patch: vi.fn(),
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

import { api } from "@/lib/api";

import { mockJson } from "./helpers/mockJson";

const baseTask: Task = {
  id: "task-1",
  organizationId: "org-1",
  originMeetingId: null,
  decisionItemId: null,
  title: "資料作成",
  body: "本文",
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
  version: 3,
  createdAt: "2026-05-17T00:00:00.000Z",
  updatedAt: "2026-05-17T00:00:00.000Z",
  organization: { id: "org-1", name: "ACME" },
  originMeeting: null,
  assignees: [
    {
      id: "user-1",
      name: "alice",
      displayName: "Alice",
      email: "a@example.com",
    },
  ],
  recurringMeetings: [{ id: "rmtg-1", name: "週次定例" }],
};

beforeEach(() => {
  vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
    mockJson([
      {
        userId: "user-1",
        name: "alice",
        displayName: "Alice",
        email: "a@example.com",
        role: "member",
        joinedAt: "2026-05-01T00:00:00.000Z",
      },
      {
        userId: "user-2",
        name: "bob",
        displayName: "Bob",
        email: "b@example.com",
        role: "member",
        joinedAt: "2026-05-01T00:00:00.000Z",
      },
    ]),
  );
  vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
    mockJson([
      {
        id: "rmtg-1",
        organizationId: "org-1",
        name: "週次定例",
        description: null,
        scheduleCron: "0 10 * * 1",
        defaultDurationMinutes: 60,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
        _count: { members: 1 },
      },
    ]),
  );
  vi.mocked(api.tasks[":id"].$patch).mockResolvedValue(
    mockJson({ ...baseTask, version: 4 }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EditTaskDialog", () => {
  it("初期値が task からプリフィルされる", async () => {
    renderWithQuery(
      <EditTaskDialog task={baseTask} open onOpenChange={() => {}} />,
    );
    expect(await screen.findByLabelText("タイトル")).toHaveValue("資料作成");
    expect(screen.getByLabelText("本文")).toHaveValue("本文");
    expect(screen.getByLabelText("ステータス")).toHaveValue("todo");
  });

  it("title を変更して保存すると PATCH が呼ばれ version が送られる", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <EditTaskDialog task={baseTask} open onOpenChange={() => {}} />,
    );

    const titleInput = await screen.findByLabelText("タイトル");
    await user.clear(titleInput);
    await user.type(titleInput, "更新後");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(api.tasks[":id"].$patch).toHaveBeenCalled();
    });
    const call = vi.mocked(api.tasks[":id"].$patch).mock.calls[0];
    const sent = (call[0] as { json: { title?: string; version: number } })
      .json;
    expect(sent.version).toBe(3);
    expect(sent.title).toBe("更新後");
  });

  it("変更なしの保存でも version のみは送る（API 側で 400 になるがフロントは試みる）", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <EditTaskDialog task={baseTask} open onOpenChange={() => {}} />,
    );

    await screen.findByLabelText("タイトル");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(api.tasks[":id"].$patch).toHaveBeenCalled();
    });
    const call = vi.mocked(api.tasks[":id"].$patch).mock.calls[0];
    const sent = (call[0] as { json: Record<string, unknown> }).json;
    // version 以外のキーは無い
    expect(Object.keys(sent)).toEqual(["version"]);
  });

  it("409 (version 不一致) は専用メッセージと再取得ボタンを表示する", async () => {
    vi.mocked(api.tasks[":id"].$patch).mockResolvedValue(
      mockJson({ error: "conflict" }, 409),
    );
    const user = userEvent.setup();
    renderWithQuery(
      <EditTaskDialog task={baseTask} open onOpenChange={() => {}} />,
    );

    const titleInput = await screen.findByLabelText("タイトル");
    await user.clear(titleInput);
    await user.type(titleInput, "更新後");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText(/他のユーザーが先に更新しました/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "最新を取得" }),
    ).toBeInTheDocument();
  });

  it("AI 由来フィールドがあれば read-only セクションが表示される", async () => {
    const aiTask: Task = {
      ...baseTask,
      sourceQuote: "「GW明けまでに」",
      ambiguityFlags: ["no_deadline_absolute"],
    };
    renderWithQuery(
      <EditTaskDialog task={aiTask} open onOpenChange={() => {}} />,
    );
    expect(
      await screen.findByText("AI 抽出情報（読み取り専用）"),
    ).toBeInTheDocument();
  });

  it("AI 由来フィールドが全て空ならセクションは非表示", async () => {
    renderWithQuery(
      <EditTaskDialog task={baseTask} open onOpenChange={() => {}} />,
    );
    await screen.findByLabelText("タイトル");
    expect(
      screen.queryByText("AI 抽出情報（読み取り専用）"),
    ).not.toBeInTheDocument();
  });

  it("dueDate を変更すると null から ISO に変換されて送られる", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <EditTaskDialog task={baseTask} open onOpenChange={() => {}} />,
    );

    const dueInput = await screen.findByLabelText("期限");
    await user.type(dueInput, "2026-05-25");
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(api.tasks[":id"].$patch).toHaveBeenCalled());
    const call = vi.mocked(api.tasks[":id"].$patch).mock.calls[0];
    expect((call[0] as { json: { dueDate?: string } }).json.dueDate).toBe(
      "2026-05-25T00:00:00.000Z",
    );
  });

  it("onRequestDelete を渡すと削除ボタンが表示される", async () => {
    const onRequestDelete = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <EditTaskDialog
        task={baseTask}
        open
        onOpenChange={() => {}}
        onRequestDelete={onRequestDelete}
      />,
    );

    const deleteBtn = await screen.findByRole("button", { name: "削除" });
    await user.click(deleteBtn);
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });
});
