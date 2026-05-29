import type { RecommendedAgendaItem } from "../hooks/useMeetingDetail";

type AgendaItemListProps = {
  items: RecommendedAgendaItem[];
};

// 推奨アジェンダ項目を番号付きリストで表示する共通コンポーネント。
// 現在の推奨アジェンダ（RecommendedAgendaSection）と履歴（AgendaHistorySection）で共用する。
export function AgendaItemList({ items }: AgendaItemListProps) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        // タイトルは AI 出力上の項目識別子として一意に並ぶ前提で key に用いる。
        <li key={item.title} className="text-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
            <span className="font-medium flex-1">{item.title}</span>
            {item.estimated_minutes != null && (
              <span className="text-xs text-muted-foreground shrink-0">
                約{item.estimated_minutes}分
              </span>
            )}
          </div>
          {item.reason && item.reason.trim().length > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5 pl-5">
              理由: {item.reason}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
