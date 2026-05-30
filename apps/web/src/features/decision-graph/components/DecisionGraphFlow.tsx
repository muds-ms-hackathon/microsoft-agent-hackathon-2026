import {
  Background,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { NODE_COLORS, computeHighlight, toFlowElements } from "../layout";
import type { DecisionGraph, GraphNodeType } from "../types";

// 当該会議ノードは青枠で強調し、それ以外は薄いグレー枠にする。
function nodeStyle(graphType: GraphNodeType, current: boolean): CSSProperties {
  return {
    background: NODE_COLORS[graphType],
    border: current ? "2px solid #2563eb" : "1px solid #cbd5e1",
    borderRadius: 8,
    fontSize: 12,
    padding: 6,
    width: 170,
  };
}

// 意思決定文脈グラフの描画本体。ノードをクリックすると、その来歴（接続する
// ノード・エッジ）を強調し、無関係なノードを淡色化する。同じノードを再クリック、
// または余白クリックで選択を解除する。
export function DecisionGraphFlow({ graph }: { graph: DecisionGraph }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const base = useMemo(() => toFlowElements(graph), [graph]);
  const highlight = useMemo(
    () => computeHighlight(graph.edges, selectedId),
    [graph.edges, selectedId],
  );

  const nodes: Node[] = base.nodes.map((n) => {
    const graphType = n.data.graphType as GraphNodeType;
    const current = n.data.current === true;
    const dimmed = selectedId !== null && !highlight.nodeIds.has(n.id);
    return {
      ...n,
      style: { ...nodeStyle(graphType, current), opacity: dimmed ? 0.25 : 1 },
    };
  });

  const edges: Edge[] = base.edges.map((e) => {
    const active = selectedId !== null && highlight.edgeIds.has(e.id);
    const dimmed = selectedId !== null && !active;
    return {
      ...e,
      animated: active,
      style: { opacity: dimmed ? 0.15 : 1 },
    };
  });

  return (
    <div style={{ height: 600 }} className="rounded-lg border border-border/70">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={(_, node) =>
          setSelectedId((cur) => (cur === node.id ? null : node.id))
        }
        onPaneClick={() => setSelectedId(null)}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
