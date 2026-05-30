import {
  EDGE_LABELS,
  NODE_ROW_Y,
  computeHighlight,
  toFlowElements,
} from "@/features/decision-graph/layout";
import type { DecisionGraph } from "@/features/decision-graph/types";
import { describe, expect, it } from "vitest";

const sampleGraph: DecisionGraph = {
  nodes: [
    {
      id: "meeting:m1",
      type: "meeting",
      label: "第3回",
      data: { current: true },
    },
    {
      id: "meeting:m2",
      type: "meeting",
      label: "第4回",
      data: { current: false },
    },
    {
      id: "decision:d1",
      type: "decision",
      label: "予算承認",
      data: { status: "decided" },
    },
    {
      id: "task:t1",
      type: "task",
      label: "資料作成",
      data: { status: "todo" },
    },
  ],
  edges: [
    {
      id: "produces:meeting:m1->decision:d1",
      source: "meeting:m1",
      target: "decision:d1",
      type: "produces",
    },
    {
      id: "derives:decision:d1->task:t1",
      source: "decision:d1",
      target: "task:t1",
      type: "derives",
    },
    {
      id: "chain:meeting:m1->meeting:m2",
      source: "meeting:m1",
      target: "meeting:m2",
      type: "chain",
    },
  ],
};

describe("toFlowElements", () => {
  it("ノードを種別ごとの行 y に配置する", () => {
    const { nodes } = toFlowElements(sampleGraph);

    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId["meeting:m1"].position.y).toBe(NODE_ROW_Y.meeting);
    expect(byId["decision:d1"].position.y).toBe(NODE_ROW_Y.decision);
    expect(byId["task:t1"].position.y).toBe(NODE_ROW_Y.task);
  });

  it("同一行のノードは横に展開し、x が重ならない", () => {
    const { nodes } = toFlowElements(sampleGraph);

    const meetings = nodes.filter((n) => n.data.graphType === "meeting");
    const xs = meetings.map((n) => n.position.x);
    expect(new Set(xs).size).toBe(meetings.length);
  });

  it("data に label・graphType・current を載せる", () => {
    const { nodes } = toFlowElements(sampleGraph);
    const current = nodes.find((n) => n.id === "meeting:m1");

    expect(current?.data).toMatchObject({
      label: "第3回",
      graphType: "meeting",
      current: true,
    });
  });

  it("エッジを source/target とラベル付きで変換する", () => {
    const { edges } = toFlowElements(sampleGraph);
    const derives = edges.find((e) => e.id === "derives:decision:d1->task:t1");

    expect(derives).toMatchObject({
      source: "decision:d1",
      target: "task:t1",
      label: EDGE_LABELS.derives,
    });
  });

  it("空グラフは空の nodes/edges を返す", () => {
    const { nodes, edges } = toFlowElements({ nodes: [], edges: [] });
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });
});

describe("computeHighlight", () => {
  it("選択なし（null）は空集合を返す", () => {
    const { nodeIds, edgeIds } = computeHighlight(sampleGraph.edges, null);
    expect(nodeIds.size).toBe(0);
    expect(edgeIds.size).toBe(0);
  });

  it("選択ノードに接続する近傍ノード・エッジのみを含む", () => {
    const { nodeIds, edgeIds } = computeHighlight(
      sampleGraph.edges,
      "decision:d1",
    );

    // decision:d1 自身と、接続する meeting:m1 / task:t1 を含む
    expect(nodeIds.has("decision:d1")).toBe(true);
    expect(nodeIds.has("meeting:m1")).toBe(true);
    expect(nodeIds.has("task:t1")).toBe(true);
    // 接続しない meeting:m2 は含まない
    expect(nodeIds.has("meeting:m2")).toBe(false);

    // d1 に接続する 2 本のエッジのみ
    expect(edgeIds.has("produces:meeting:m1->decision:d1")).toBe(true);
    expect(edgeIds.has("derives:decision:d1->task:t1")).toBe(true);
    expect(edgeIds.has("chain:meeting:m1->meeting:m2")).toBe(false);
  });
});
