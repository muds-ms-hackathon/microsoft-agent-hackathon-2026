// 意思決定文脈グラフの型。API (GET /meetings/:id/decision-graph) のレスポンスに対応する。
// バックエンドの apps/api/src/lib/decision-graph-serialization.ts と同じ構造。

export type GraphNodeType =
  | "meeting"
  | "decision"
  | "task"
  | "ambiguous"
  | "topic";

export type GraphEdgeType =
  | "chain"
  | "produces"
  | "derives"
  | "carryover"
  | "blocks"
  | "resolves"
  | "agenda";

export type DecisionGraphNode = {
  id: string;
  type: GraphNodeType;
  label: string;
  // status / current / priority など種別ごとの最小メタ。表示で参照する。
  data: Record<string, unknown>;
};

export type DecisionGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: GraphEdgeType;
};

export type DecisionGraph = {
  nodes: DecisionGraphNode[];
  edges: DecisionGraphEdge[];
};
