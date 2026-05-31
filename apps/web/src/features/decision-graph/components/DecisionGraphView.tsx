import { SectionError } from "@/components/ui/SectionError";
import { NODE_COLORS, NODE_TYPE_LABELS } from "../layout";
import type { GraphNodeType } from "../types";
import { useDecisionGraph } from "../useDecisionGraph";
import { DecisionGraphFlow } from "./DecisionGraphFlow";

// 会議の意思決定文脈グラフを表示する。ローディング・エラー・空状態を分岐し、
// データがあるときのみ描画本体 (DecisionGraphFlow) をマウントする。
export function DecisionGraphView({ meetingId }: { meetingId: string }) {
  const query = useDecisionGraph(meetingId);

  if (query.isLoading) {
    return <p className="text-muted-foreground">グラフを読み込み中...</p>;
  }
  if (query.isError || !query.data) {
    return (
      <SectionError
        message="意思決定グラフの取得に失敗しました"
        onRetry={() => query.refetch()}
      />
    );
  }

  const graph = query.data;
  // 会議ノードは常に 1 つ返るため、エッジの有無で「関連項目あり」を判定する。
  const hasRelations = graph.edges.length > 0;

  return (
    <div className="space-y-3">
      <Legend />
      {!hasRelations && (
        <p className="text-sm text-muted-foreground">
          この会議に紐づく決定・タスク・未決・次回議題はまだありません
        </p>
      )}
      <DecisionGraphFlow graph={graph} />
    </div>
  );
}

// 種別ごとの色と意味を示す凡例。
function Legend() {
  const types = Object.keys(NODE_TYPE_LABELS) as GraphNodeType[];
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {types.map((t) => (
        <span key={t} className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className="inline-block h-3 w-3 rounded border border-border/60"
            style={{ background: NODE_COLORS[t] }}
          />
          {NODE_TYPE_LABELS[t]}
        </span>
      ))}
    </div>
  );
}
