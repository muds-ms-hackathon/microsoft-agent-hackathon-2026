import { AssigneeDropdown } from "@/features/common/components/AssigneeDropdown";
import { AssigneePicker } from "@/features/tasks/components/AssigneePicker";
import { RecurringMeetingPicker } from "@/features/tasks/components/RecurringMeetingPicker";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
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

import { mockJson } from "./helpers/mockJson";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AssigneePicker", () => {
  it("メンバーをチップで表示しトグルできる", async () => {
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

    const onChange = vi.fn();
    renderWithQuery(
      <AssigneePicker
        organizationId="org-1"
        value={["user-1"]}
        onChange={onChange}
      />,
    );

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();

    // 既選択を外す
    await userEvent.click(screen.getByText("Alice"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("メンバー 0 件は空メッセージ", async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson([]),
    );
    renderWithQuery(
      <AssigneePicker organizationId="org-1" value={[]} onChange={() => {}} />,
    );
    expect(
      await screen.findByText("組織にメンバーがいません"),
    ).toBeInTheDocument();
  });
});

describe("AssigneeDropdown", () => {
  const members = [
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
  ];

  it("ボタンクリックでドロップダウンが開きメンバーが表示される", async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(members),
    );

    renderWithQuery(
      <AssigneeDropdown
        organizationId="org-1"
        value={[]}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /担当者を選択/ }));
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("メンバーを選択するとonChangeが呼ばれる", async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(members),
    );

    const onChange = vi.fn();
    renderWithQuery(
      <AssigneeDropdown
        organizationId="org-1"
        value={[]}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /担当者を選択/ }));
    await userEvent.click(await screen.findByText("Alice"));
    expect(onChange).toHaveBeenCalledWith(["user-1"]);
  });

  it("選択済みメンバーの名前がボタンに表示される", async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(members),
    );

    renderWithQuery(
      <AssigneeDropdown
        organizationId="org-1"
        value={["user-1"]}
        onChange={() => {}}
      />,
    );

    expect(
      await screen.findByRole("button", { name: /Alice/ }),
    ).toBeInTheDocument();
  });

  it("メンバー 0 件は空メッセージ", async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson([]),
    );

    renderWithQuery(
      <AssigneeDropdown
        organizationId="org-1"
        value={[]}
        onChange={() => {}}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /担当者を選択/ }));
    expect(await screen.findByText("メンバーがいません")).toBeInTheDocument();
  });
});

describe("RecurringMeetingPicker", () => {
  it("定例をチップで表示しトグルできる", async () => {
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

    const onChange = vi.fn();
    renderWithQuery(
      <RecurringMeetingPicker
        organizationId="org-1"
        value={[]}
        onChange={onChange}
      />,
    );

    expect(await screen.findByText("週次定例")).toBeInTheDocument();
    await userEvent.click(screen.getByText("週次定例"));
    expect(onChange).toHaveBeenCalledWith(["rmtg-1"]);
  });

  it("定例 0 件は空メッセージ", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([]),
    );
    renderWithQuery(
      <RecurringMeetingPicker
        organizationId="org-1"
        value={[]}
        onChange={() => {}}
      />,
    );
    expect(
      await screen.findByText("組織に定例がありません"),
    ).toBeInTheDocument();
  });
});
