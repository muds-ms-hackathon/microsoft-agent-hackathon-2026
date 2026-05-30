import { DecisionGraphView } from "@/features/decision-graph/components/DecisionGraphView";
import { Link, createFileRoute } from "@tanstack/react-router";

// ファイル名の `$id_`（末尾アンダースコア）で meetings.$id レイアウトから独立させる。
// これがないと会議詳細ページ（Outlet を持たない）の子ルート扱いになり、グラフが
// 描画されず会議詳細にフォールバックしてしまう。URL は /meetings/$id/decision-graph のまま。
export const Route = createFileRoute("/meetings/$id_/decision-graph")({
  component: DecisionGraphPage,
});

function DecisionGraphPage() {
  const { id } = Route.useParams();
  return (
    <section className="container mx-auto space-y-4 p-8">
      <Link
        to="/meetings/$id"
        params={{ id }}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← 会議詳細に戻る
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">意思決定の文脈グラフ</h1>
        <p className="text-sm text-muted-foreground">
          この会議を起点に、決定・タスク・未決・次回議題の来歴をたどれます。ノードを選ぶと関連が強調されます。
        </p>
      </div>
      <DecisionGraphView meetingId={id} />
    </section>
  );
}
