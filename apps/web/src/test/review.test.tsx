import { ReviewItemCard } from "@/features/review/components/ReviewItemCard";
import type { ReviewItem } from "@/features/review/types";
import { useReviewItems } from "@/features/review/useReviewItems";
import { act, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    organizations: {
      ":id": {
        members: { $get: vi.fn() },
        meetings: { $get: vi.fn() },
        "review-items": { $get: vi.fn() },
      },
    },
    "recurring-meetings": {
      ":id": {
        $get: vi.fn(),
        "review-items": { $get: vi.fn() },
      },
    },
    meetings: {
      ":id": {
        "review-items": { $get: vi.fn() },
      },
    },
    "decision-items": {
      ":id": { $patch: vi.fn() },
    },
    tasks: {
      $post: vi.fn(),
      ":id": { $patch: vi.fn() },
    },
    "ambiguous-infos": {
      ":id": { $patch: vi.fn() },
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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ReviewView } from "../routes/review";
import { mockJson } from "./helpers/mockJson";

function makeItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: "item-1",
    sourceTable: "task",
    type: "task_candidate",
    title: "テストタスク",
    body: null,
    sourceQuote: null,
    sourceContext: null,
    status: "draft",
    assignees: [],
    deadline: null,
    severity: null,
    resolutionType: null,
    recurringMeetingId: "rmtg-1",
    meetingId: "mtg-1",
    version: 0,
    ...overrides,
  };
}

function makeWrapper(queryKey: readonly unknown[], data: unknown[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(queryKey, data);
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return Wrapper;
}

beforeEach(() => {
  vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
    mockJson([]),
  );
  vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
    mockJson([]),
  );
  vi.mocked(api.organizations[":id"]["review-items"].$get).mockResolvedValue(
    mockJson([]),
  );
  vi.mocked(
    api["recurring-meetings"][":id"]["review-items"].$get,
  ).mockResolvedValue(mockJson([]));
  vi.mocked(api.meetings[":id"]["review-items"].$get).mockResolvedValue(
    mockJson([]),
  );
  vi.mocked(api.tasks.$post).mockResolvedValue(
    mockJson({ id: "task-new" }, 201),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReviewItemCard", () => {
  it("task_candidate は「タスクとして登録」ボタンを表示する", () => {
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "task_candidate" })}
        onUpdate={async () => {}}
        onResolveAmbiguity={async () => {}}
        orgId="org-1"
      />,
    );
    expect(
      screen.getByRole("button", { name: "タスクとして登録" }),
    ).toBeInTheDocument();
  });

  it("open_issue は「承認」ボタンを表示する", () => {
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "open_issue" })}
        onUpdate={async () => {}}
        onResolveAmbiguity={async () => {}}
        orgId="org-1"
      />,
    );
    expect(screen.getByRole("button", { name: "承認" })).toBeInTheDocument();
  });

  it("ambiguity は「タスクにする」「未決事項にする」「破棄」の3択を表示する", () => {
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "ambiguity", severity: "medium" })}
        onUpdate={async () => {}}
        onResolveAmbiguity={async () => {}}
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
        item={makeItem({ title: "元の内容" })}
        onUpdate={async () => {}}
        onResolveAmbiguity={async () => {}}
        orgId="org-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "修正" }));
    expect(screen.getByRole("textbox")).toHaveValue("元の内容");

    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("元の内容")).toBeInTheDocument();
  });

  it("task_candidate の「保存」で title・assignees・deadline を onUpdate に渡す", async () => {
    const onUpdate = vi.fn();
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "task_candidate", title: "元の内容" })}
        onUpdate={onUpdate}
        onResolveAmbiguity={async () => {}}
        orgId="org-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "修正" }));
    const textarea = screen.getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "修正後の内容");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onUpdate).toHaveBeenCalledWith("item-1", {
      title: "修正後の内容",
      assignees: [],
      deadline: null,
    });
  });

  it("open_issue の「保存」で title・assignees・deadline を onUpdate に渡す", async () => {
    const onUpdate = vi.fn();
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "open_issue", title: "元の課題" })}
        onUpdate={onUpdate}
        onResolveAmbiguity={async () => {}}
        orgId="org-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "修正" }));
    const textarea = screen.getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "修正後の課題");
    await userEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(onUpdate).toHaveBeenCalledWith("item-1", {
      title: "修正後の課題",
      assignees: [],
      deadline: null,
    });
  });

  it("「却下」で status:rejected を onUpdate に渡す", async () => {
    const onUpdate = vi.fn();
    renderWithQuery(
      <ReviewItemCard
        item={makeItem()}
        onUpdate={onUpdate}
        onResolveAmbiguity={async () => {}}
        orgId="org-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "却下" }));
    expect(onUpdate).toHaveBeenCalledWith("item-1", { status: "rejected" });
  });

  it("open_issue の「承認」で status:decided を onUpdate に渡す（type 変換なし）", async () => {
    const onUpdate = vi.fn();
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "open_issue" })}
        onUpdate={onUpdate}
        onResolveAmbiguity={async () => {}}
        orgId="org-1"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "承認" }));
    expect(onUpdate).toHaveBeenCalledWith("item-1", {
      status: "decided",
      assignees: [],
      deadline: null,
    });
    expect(onUpdate).not.toHaveBeenCalledWith(
      "item-1",
      expect.objectContaining({ type: "decision" }),
    );
  });
});

describe("ReviewView", () => {
  const noOp = async () => {};

  it("渡されたアイテムをステータスに関わらずすべて表示する（ステータス絞り込みは API 側で行う）", () => {
    const items = [
      makeItem({ id: "i1", title: "確認待ちタスク", status: "draft" }),
      makeItem({ id: "i2", title: "確定済みタスク", status: "decided" }),
    ];

    renderWithQuery(
      <ReviewView
        search={{}}
        onSearchChange={noOp}
        currentOrgId="org-1"
        items={items}
        onUpdate={noOp}
        onResolveAmbiguity={noOp}
      />,
    );

    expect(screen.getByText("確認待ちタスク")).toBeInTheDocument();
    expect(screen.getByText("確定済みタスク")).toBeInTheDocument();
  });

  it("定例スコープ指定で pending アイテムが 0 件のとき「レビューが完了しました」を表示する", () => {
    renderWithQuery(
      <ReviewView
        search={{ recurringMeetingId: "rm-1" }}
        onSearchChange={noOp}
        currentOrgId="org-1"
        items={[]}
        onUpdate={noOp}
        onResolveAmbiguity={noOp}
      />,
    );

    expect(screen.getByText("レビューが完了しました")).toBeInTheDocument();
  });

  it("種別フィルタで指定した種別のみ表示する", () => {
    const items = [
      makeItem({
        id: "i1",
        type: "task_candidate",
        title: "このタスクを確認",
      }),
      makeItem({ id: "i2", type: "open_issue", title: "この課題を確認" }),
    ];

    renderWithQuery(
      <ReviewView
        search={{ type: "task_candidate" }}
        onSearchChange={noOp}
        currentOrgId="org-1"
        items={items}
        onUpdate={noOp}
        onResolveAmbiguity={noOp}
      />,
    );

    expect(screen.getByText("このタスクを確認")).toBeInTheDocument();
    expect(screen.queryByText("この課題を確認")).not.toBeInTheDocument();
  });
});

describe("ReviewItemCard — body 表示", () => {
  it("body がある場合はタイトル下に表示する", () => {
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ body: "詳細説明テキスト" })}
        onUpdate={async () => {}}
        onResolveAmbiguity={async () => {}}
        orgId="org-1"
      />,
    );
    expect(screen.getByText("詳細説明テキスト")).toBeInTheDocument();
  });

  it("body が null のとき詳細テキストは描画しない", () => {
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ body: null })}
        onUpdate={async () => {}}
        onResolveAmbiguity={async () => {}}
        orgId="org-1"
      />,
    );
    expect(screen.queryByText("詳細説明テキスト")).not.toBeInTheDocument();
  });
});

describe("ReviewItemCard — ambiguity 解消ボタン", () => {
  it("「タスクにする」で onResolveAmbiguity が task 解消パラメータで呼ばれる", async () => {
    const onResolveAmbiguity = vi.fn().mockResolvedValue(undefined);
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({
          type: "ambiguity",
          sourceTable: "ambiguous_info",
          recurringMeetingId: "rmtg-1",
        })}
        onUpdate={async () => {}}
        onResolveAmbiguity={onResolveAmbiguity}
        orgId="org-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "タスクにする" }));

    expect(onResolveAmbiguity).toHaveBeenCalledWith("item-1", {
      resolution: "task",
      assigneeUserIds: [],
      dueDate: null,
      recurringMeetingIds: ["rmtg-1"],
    });
  });

  it("「未決事項にする」で onResolveAmbiguity が decision_item 解消パラメータで呼ばれる", async () => {
    const onResolveAmbiguity = vi.fn().mockResolvedValue(undefined);
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "ambiguity", sourceTable: "ambiguous_info" })}
        onUpdate={async () => {}}
        onResolveAmbiguity={onResolveAmbiguity}
        orgId="org-1"
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "未決事項にする" }),
    );

    expect(onResolveAmbiguity).toHaveBeenCalledWith("item-1", {
      resolution: "decision_item",
    });
  });

  it("「破棄」で onResolveAmbiguity が rejected パラメータで呼ばれる", async () => {
    const onResolveAmbiguity = vi.fn().mockResolvedValue(undefined);
    renderWithQuery(
      <ReviewItemCard
        item={makeItem({ type: "ambiguity", sourceTable: "ambiguous_info" })}
        onUpdate={async () => {}}
        onResolveAmbiguity={onResolveAmbiguity}
        orgId="org-1"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "破棄" }));

    expect(onResolveAmbiguity).toHaveBeenCalledWith("item-1", {
      resolution: "rejected",
    });
  });
});

describe("useReviewItems — updateItem", () => {
  it("decision_item の却下で PATCH status が cancelled になる", async () => {
    const item = makeItem({
      id: "di-1",
      sourceTable: "decision_item",
      type: "decision",
      version: 2,
    });
    vi.mocked(api["decision-items"][":id"].$patch).mockResolvedValue(
      mockJson({ ...item, status: "cancelled" as const }),
    );

    const { result } = renderHook(
      () => useReviewItems({ meetingId: "mtg-di" }),
      { wrapper: makeWrapper(["meetings", "mtg-di", "review-items"], [item]) },
    );

    await act(async () => {
      await result.current.updateItem("di-1", { status: "rejected" });
    });

    expect(vi.mocked(api["decision-items"][":id"].$patch)).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({ status: "cancelled" }),
      }),
      expect.anything(),
    );
  });

  it("open_issue 承認で PATCH に decisionState:confirmed が含まれる", async () => {
    const item = makeItem({
      id: "di-2",
      sourceTable: "decision_item",
      type: "open_issue",
      version: 1,
    });
    vi.mocked(api["decision-items"][":id"].$patch).mockResolvedValue(
      mockJson({ ...item, status: "decided" as const }),
    );

    const { result } = renderHook(
      () => useReviewItems({ meetingId: "mtg-oi" }),
      { wrapper: makeWrapper(["meetings", "mtg-oi", "review-items"], [item]) },
    );

    await act(async () => {
      await result.current.updateItem("di-2", { status: "decided" });
    });

    expect(vi.mocked(api["decision-items"][":id"].$patch)).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          status: "decided",
          decisionState: "confirmed",
        }),
      }),
      expect.anything(),
    );
  });

  it("task_candidate 確定で PATCH に recurringMeetingIds が含まれる", async () => {
    const item = makeItem({
      id: "t-1",
      sourceTable: "task",
      type: "task_candidate",
      recurringMeetingId: "rmtg-99",
      version: 1,
    });
    vi.mocked(api.tasks[":id"].$patch).mockResolvedValue(
      mockJson({
        id: "t-1",
        title: item.title,
        status: "todo",
        assignees: [],
        dueDate: null,
        version: 2,
      }),
    );

    const { result } = renderHook(
      () => useReviewItems({ meetingId: "mtg-task" }),
      {
        wrapper: makeWrapper(["meetings", "mtg-task", "review-items"], [item]),
      },
    );

    await act(async () => {
      await result.current.updateItem("t-1", { status: "decided" });
    });

    expect(vi.mocked(api.tasks[":id"].$patch)).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          status: "todo",
          recurringMeetingIds: ["rmtg-99"],
        }),
      }),
      expect.anything(),
    );
  });
});

describe("useReviewItems — resolveAmbiguity", () => {
  const ambigItem = makeItem({
    id: "amb-1",
    sourceTable: "ambiguous_info",
    type: "ambiguity",
    version: 0,
  });
  const ambigKey = ["meetings", "mtg-amb", "review-items"] as const;

  it("resolution:task で PATCH に resolutionType:task が含まれる", async () => {
    vi.mocked(api["ambiguous-infos"][":id"].$patch).mockResolvedValue(
      mockJson({ ...ambigItem, resolutionType: "task" }),
    );

    const { result } = renderHook(
      () => useReviewItems({ meetingId: "mtg-amb" }),
      { wrapper: makeWrapper(ambigKey, [ambigItem]) },
    );

    await act(async () => {
      await result.current.resolveAmbiguity("amb-1", {
        resolution: "task",
        assigneeUserIds: [],
        dueDate: null,
        recurringMeetingIds: ["rmtg-1"],
      });
    });

    expect(
      vi.mocked(api["ambiguous-infos"][":id"].$patch),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({ resolutionType: "task" }),
      }),
      expect.anything(),
    );
  });

  it("resolution:decision_item で PATCH に resolutionType:decision_item が含まれる", async () => {
    vi.mocked(api["ambiguous-infos"][":id"].$patch).mockResolvedValue(
      mockJson({ ...ambigItem, resolutionType: "decision_item" }),
    );

    const { result } = renderHook(
      () => useReviewItems({ meetingId: "mtg-amb" }),
      { wrapper: makeWrapper(ambigKey, [ambigItem]) },
    );

    await act(async () => {
      await result.current.resolveAmbiguity("amb-1", {
        resolution: "decision_item",
      });
    });

    expect(
      vi.mocked(api["ambiguous-infos"][":id"].$patch),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({ resolutionType: "decision_item" }),
      }),
      expect.anything(),
    );
  });

  it("resolution:rejected で PATCH に status:rejected が含まれる", async () => {
    vi.mocked(api["ambiguous-infos"][":id"].$patch).mockResolvedValue(
      mockJson({ ...ambigItem, status: "rejected" as const }),
    );

    const { result } = renderHook(
      () => useReviewItems({ meetingId: "mtg-amb" }),
      { wrapper: makeWrapper(ambigKey, [ambigItem]) },
    );

    await act(async () => {
      await result.current.resolveAmbiguity("amb-1", {
        resolution: "rejected",
      });
    });

    expect(
      vi.mocked(api["ambiguous-infos"][":id"].$patch),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({ status: "rejected" }),
      }),
      expect.anything(),
    );
  });
});
