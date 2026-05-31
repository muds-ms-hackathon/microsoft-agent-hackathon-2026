import type { Edge, Node } from "@xyflow/react";
import type { DecisionGraph, GraphEdgeType, GraphNodeType } from "./types";

// 種別ごとの行（y 座標）。会議チェーンを最上段に置き、決定 → タスク → 未決 → 議題と
// 下へ流す。高度な自動レイアウトは行わず、種別を行に固定する簡易レイアウトとする。
export const NODE_ROW_Y: Record<GraphNodeType, number> = {
  meeting: 0,
  decision: 140,
  task: 280,
  ambiguous: 420,
  topic: 560,
};

// 同一行内のノード間の横方向の間隔。
const COLUMN_GAP = 220;

// エッジ種別の表示ラベル（来歴の意味を日本語で示す）。
export const EDGE_LABELS: Record<GraphEdgeType, string> = {
  chain: "会議の流れ",
  produces: "発生",
  derives: "派生タスク",
  carryover: "次回へ持ち越し",
  blocks: "依存",
  resolves: "解決先",
  agenda: "次回議題",
};

// 種別ごとの表示ラベル（凡例・ノード分類で使う）。
export const NODE_TYPE_LABELS: Record<GraphNodeType, string> = {
  meeting: "会議",
  decision: "決定",
  task: "タスク",
  ambiguous: "未決",
  topic: "次回議題",
};

// 種別ごとの背景色（凡例とノード塗りで共有する）。
export const NODE_COLORS: Record<GraphNodeType, string> = {
  meeting: "#dbeafe",
  decision: "#dcfce7",
  task: "#fef9c3",
  ambiguous: "#ffedd5",
  topic: "#f3e8ff",
};

// React Flow ノードの data に載せる表示用メタ。
export type FlowNodeData = {
  label: string;
  graphType: GraphNodeType;
  current: boolean;
};

// API のグラフを React Flow の nodes / edges へ変換する。
// 種別ごとに行を固定し、同一行のノードは出現順に横へ等間隔で並べる。
export function toFlowElements(graph: DecisionGraph): {
  nodes: Node[];
  edges: Edge[];
} {
  // 行（種別）ごとに次に使う列インデックスを保持する。
  const columnByRow: Partial<Record<GraphNodeType, number>> = {};

  const nodes: Node[] = graph.nodes.map((n) => {
    const column = columnByRow[n.type] ?? 0;
    columnByRow[n.type] = column + 1;
    return {
      id: n.id,
      position: { x: column * COLUMN_GAP, y: NODE_ROW_Y[n.type] },
      // satisfies で形を検証しつつ、Node.data（Record<string, unknown>）へ代入する。
      data: {
        label: n.label,
        graphType: n.type,
        current: n.data?.current === true,
      } satisfies FlowNodeData,
    };
  });

  const edges: Edge[] = graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: EDGE_LABELS[e.type],
    data: { graphType: e.type },
  }));

  return { nodes, edges };
}

// 選択ノードに接続する近傍（ノード ID・エッジ ID）を求める。
// selectedId が null のときは空集合（ハイライトなし）を返す。
export function computeHighlight(
  edges: DecisionGraph["edges"],
  selectedId: string | null,
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  if (!selectedId) return { nodeIds, edgeIds };

  nodeIds.add(selectedId);
  for (const e of edges) {
    if (e.source === selectedId || e.target === selectedId) {
      edgeIds.add(e.id);
      nodeIds.add(e.source);
      nodeIds.add(e.target);
    }
  }
  return { nodeIds, edgeIds };
}
