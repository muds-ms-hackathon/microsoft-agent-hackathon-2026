import { CreateTaskDialog } from "@/features/tasks/components/CreateTaskDialog";
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
      $post: vi.fn(),
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
  vi.mocked(api.tasks.$post).mockResolvedValue(
    mockJson({ id: "task-new" }, 201),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CreateTaskDialog", () => {
  it("最小入力（title のみ）で作成 API を呼ぶ", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CreateTaskDialog organizationId="org-1" />);

    await user.click(screen.getByRole("button", { name: "タスクを追加" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(await screen.findByLabelText("タイトル"), "資料作成");
    await user.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(api.tasks.$post).toHaveBeenCalled();
    });
    const call = vi.mocked(api.tasks.$post).mock.calls[0];
    expect((call[0] as { json: { title: string } }).json).toMatchObject({
      organizationId: "org-1",
      title: "資料作成",
    });
    // ダイアログが閉じる
    await waitFor(() => {
      expect(dialog).not.toBeInTheDocument();
    });
  });

  it("title 空欄で submit するとバリデーションエラーで API は呼ばれない", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CreateTaskDialog organizationId="org-1" />);

    await user.click(screen.getByRole("button", { name: "タスクを追加" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(await screen.findByText("タイトルは必須です")).toBeInTheDocument();
    expect(api.tasks.$post).not.toHaveBeenCalled();
  });

  it("recurringMeetingId プロップで定例が初期 attach される", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <CreateTaskDialog organizationId="org-1" recurringMeetingId="rmtg-1" />,
    );

    await user.click(screen.getByRole("button", { name: "タスクを追加" }));
    await screen.findByRole("dialog");
    await user.type(await screen.findByLabelText("タイトル"), "x");
    await user.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => expect(api.tasks.$post).toHaveBeenCalled());
    const call = vi.mocked(api.tasks.$post).mock.calls[0];
    expect(
      (call[0] as { json: { recurringMeetingIds?: string[] } }).json
        .recurringMeetingIds,
    ).toEqual(["rmtg-1"]);
  });

  it("dueDate は ISO8601 (UTC 00:00) に変換されて送られる", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CreateTaskDialog organizationId="org-1" />);

    await user.click(screen.getByRole("button", { name: "タスクを追加" }));
    await screen.findByRole("dialog");
    await user.type(await screen.findByLabelText("タイトル"), "x");
    await user.type(screen.getByLabelText("期限"), "2026-05-20");
    await user.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => expect(api.tasks.$post).toHaveBeenCalled());
    const call = vi.mocked(api.tasks.$post).mock.calls[0];
    expect((call[0] as { json: { dueDate?: string } }).json.dueDate).toBe(
      "2026-05-20T00:00:00.000Z",
    );
  });

  it("originMeetingId プロップは API リクエストに含まれる", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <CreateTaskDialog organizationId="org-1" originMeetingId="mtg-1" />,
    );

    await user.click(screen.getByRole("button", { name: "タスクを追加" }));
    await screen.findByRole("dialog");
    await user.type(await screen.findByLabelText("タイトル"), "x");
    await user.click(screen.getByRole("button", { name: "作成" }));

    await waitFor(() => expect(api.tasks.$post).toHaveBeenCalled());
    const call = vi.mocked(api.tasks.$post).mock.calls[0];
    expect(
      (call[0] as { json: { originMeetingId?: string } }).json.originMeetingId,
    ).toBe("mtg-1");
  });

  it("API 失敗時はエラーメッセージを表示しダイアログは閉じない", async () => {
    vi.mocked(api.tasks.$post).mockResolvedValue(
      mockJson({ error: "bad" }, 400),
    );
    const user = userEvent.setup();
    renderWithQuery(<CreateTaskDialog organizationId="org-1" />);

    await user.click(screen.getByRole("button", { name: "タスクを追加" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(await screen.findByLabelText("タイトル"), "x");
    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(
      await screen.findByText("タスクの作成に失敗しました"),
    ).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });
});
