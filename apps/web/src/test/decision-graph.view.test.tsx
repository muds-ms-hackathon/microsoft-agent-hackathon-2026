import { renderWithQuery } from "@/test/test-utils";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockJson } from "./helpers/mockJson";

// ReactFlow 本体は ResizeObserver 依存で jsdom 描画に向かないため、描画本体を
// スタブ化し、ビューの分岐（ローディング/エラー/空状態）のみを検証する。
vi.mock("@/features/decision-graph/components/DecisionGraphFlow", () => ({
  DecisionGraphFlow: ({ graph }: { graph: { nodes: unknown[] } }) => (
    <div data-testid="graph-flow">{graph.nodes.length}</div>
  ),
}));

vi.mock("@/lib/api", () => ({
  api: {
    meetings: {
      ":id": {
        "decision-graph": { $get: vi.fn() },
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

import { DecisionGraphView } from "@/features/decision-graph/components/DecisionGraphView";
import { api } from "@/lib/api";

const mockGet = vi.mocked(api.meetings[":id"]["decision-graph"].$get);

describe("DecisionGraphView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("読み込み中はローディングを表示する", () => {
    // 解決しない Promise で pending 状態を作る。
    mockGet.mockReturnValue(new Promise(() => {}) as never);
    renderWithQuery(<DecisionGraphView meetingId="m1" />);
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
  });

  it("取得失敗時はエラーを表示する", async () => {
    mockGet.mockResolvedValue(mockJson({ error: "x" }, 500));
    renderWithQuery(<DecisionGraphView meetingId="m1" />);
    await waitFor(() =>
      expect(screen.getByText(/取得に失敗/)).toBeInTheDocument(),
    );
  });

  it("関連が無い場合は空メッセージとグラフを表示する", async () => {
    mockGet.mockResolvedValue(
      mockJson({
        nodes: [
          { id: "meeting:m1", type: "meeting", label: "第1回", data: {} },
        ],
        edges: [],
      }),
    );
    renderWithQuery(<DecisionGraphView meetingId="m1" />);
    await waitFor(() =>
      expect(screen.getByTestId("graph-flow")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/紐づく決定・タスク・未決・次回議題はまだありません/),
    ).toBeInTheDocument();
  });

  it("関連がある場合は空メッセージを出さずグラフを表示する", async () => {
    mockGet.mockResolvedValue(
      mockJson({
        nodes: [
          { id: "meeting:m1", type: "meeting", label: "第1回", data: {} },
          { id: "decision:d1", type: "decision", label: "決定", data: {} },
        ],
        edges: [
          {
            id: "e1",
            source: "meeting:m1",
            target: "decision:d1",
            type: "produces",
          },
        ],
      }),
    );
    renderWithQuery(<DecisionGraphView meetingId="m1" />);
    await waitFor(() =>
      expect(screen.getByTestId("graph-flow")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/まだありません/)).not.toBeInTheDocument();
  });
});
