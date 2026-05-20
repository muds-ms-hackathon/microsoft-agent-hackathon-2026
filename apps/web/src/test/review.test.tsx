import { ReviewItemCard } from "@/features/review/components/ReviewItemCard";
import type { ReviewItem } from "@/features/review/types";
import { screen } from "@testing-library/react";
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
    "recurring-meetings": {
      ":id": { $get: vi.fn() },
    },
    tasks: {
      $post: vi.fn(),
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

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
import { ReviewView } from "../routes/review";
import { mockJson } from "./helpers/mockJson";

function makeItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: "item-1",
    type: "task_candidate",
    content: "テストタスク",
    sourceQuote: null,
    sourceContext: "",
    status: "pending",
    assigneeIds: [],
    deadline: null,
    aiProposedDeadline: null,
    severity: null,
    recurringMeetingId: "rmtg-1",
    recurringMeetingName: "週次定例",
    meetingId: "mtg-1",
    meetingLabel: "週次定例 · 5/1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
    mockJson([]),
  );
  vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
    mockJson([]),
  );
  vi.mocked(api.tasks.$post).mockResolvedValue(mockJson({ id: "task-new" }, 201));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReviewItemCard", () => {
  it("task_candidate は「タスクとして登録」ボタンを表示する", () => {
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "task_candidate" })}
        onUpdate={() => {}}
        orgId="org-1"
      />,
    );
    expect(
      screen.getByRole("button", { name: "タスクとして登録" }),
    ).toBeInTheDocument();
  });

  it("open_issue は「決定」ボタンを表示する", () => {
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "open_issue" })}
        onUpdate={() => {}}
        orgId="org-1"
      />,
    );
    expect(screen.getByRole("button", { name: "決定" })).toBeInTheDocument();
  });

  it("ambiguity は「タスクにする」「未決事項にする」「破棄」の3択を表示する", () => {
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "ambiguity", severity: "medium" })}
        onUpdate={() => {}}
        orgId="org-1"
      />,
    );
    expect(
      screen.getByRole("button", { name: "タスクにする" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "未決事項にする" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "破棄" })).toBeInTheDocument();
  });

  it("「修正」で編集モードに入り「キャンセル」で元に戻る", async () => {
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ content: "元の内容" })}
        onUpdate={() => {}}
        orgId="org-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "修正" }));
    expect(screen.getByRole("textbox")).toHaveValue("元の内容");

    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("元の内容")).toBeInTheDocument();
  });

  it("task_candidate の「保存」で content・assigneeIds・deadline を onUpdate に渡す", async () => {
    const onUpdate = vi.fn();
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "task_candidate", content: "元の内容" })}
        onUpdate={onUpdate}
        orgId="org-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "修正" }));
    const textarea = screen.getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "修正後の内容");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onUpdate).toHaveBeenCalledWith("item-1", {
      content: "修正後の内容",
      assigneeIds: [],
      deadline: null,
    });
  });

  it("open_issue の「保存して決定」で status:confirmed を onUpdate に渡す", async () => {
    const onUpdate = vi.fn();
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "open_issue" })}
        onUpdate={onUpdate}
        orgId="org-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "修正" }));
    await userEvent.click(screen.getByRole("button", { name: "保存して決定" }));

    expect(onUpdate).toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ status: "confirmed" }),
    );
  });

  it("「却下」で status:rejected を onUpdate に渡す", async () => {
    const onUpdate = vi.fn();
    renderWithQuery(
      <ReviewItemCard
        item={makeItem()}
        onUpdate={onUpdate}
        orgId="org-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "却下" }));
    expect(onUpdate).toHaveBeenCalledWith("item-1", { status: "rejected" });
  });
});

describe("ReviewView", () => {
  const noOp = () => {};

  it("pending アイテムのみ表示し confirmed・rejected は除外する", () => {
    const items = [
      makeItem({ id: "i1", content: "確認待ちタスク", status: "pending" }),
      makeItem({ id: "i2", content: "確定済みタスク", status: "confirmed" }),
      makeItem({ id: "i3", content: "却下済みタスク", status: "rejected" }),
    ];

    renderWithQuery(
      <ReviewView
        search={{}}
        onSearchChange={noOp}
        currentOrgId="org-1"
        items={items}
        onAddItem={noOp}
        onUpdate={noOp}
      />,
    );

    expect(screen.getByText("確認待ちタスク")).toBeInTheDocument();
    expect(screen.queryByText("確定済みタスク")).not.toBeInTheDocument();
    expect(screen.queryByText("却下済みタスク")).not.toBeInTheDocument();
  });

  it("全件確定後に「レビューが完了しました」を表示する", () => {
    const items = [makeItem({ id: "i1", status: "confirmed" })];

    renderWithQuery(
      <ReviewView
        search={{}}
        onSearchChange={noOp}
        currentOrgId="org-1"
        items={items}
        onAddItem={noOp}
        onUpdate={noOp}
      />,
    );

    expect(screen.getByText("レビューが完了しました")).toBeInTheDocument();
  });

  it("種別フィルタで指定した種別のみ表示する", () => {
    const items = [
      makeItem({ id: "i1", type: "task_candidate", content: "このタスクを確認" }),
      makeItem({ id: "i2", type: "open_issue", content: "この課題を確認" }),
    ];

    renderWithQuery(
      <ReviewView
        search={{ type: "task_candidate" }}
        onSearchChange={noOp}
        currentOrgId="org-1"
        items={items}
        onAddItem={noOp}
        onUpdate={noOp}
      />,
    );

    expect(screen.getByText("このタスクを確認")).toBeInTheDocument();
    expect(screen.queryByText("この課題を確認")).not.toBeInTheDocument();
  });
});
