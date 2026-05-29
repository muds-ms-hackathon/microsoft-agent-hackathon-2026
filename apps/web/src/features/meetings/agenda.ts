import type { RecommendedAgendaItem } from "./hooks/useMeetingDetail";

// 推奨アジェンダ（構造化配列）をクリップボード向けのプレーンテキストへ整形する。
// 例:
//   1. 設計書レビュー担当の確定（約5分）
//      理由: 未決事項の解消
// estimated_minutes / reason が欠落・null の項目は該当部分を省略する。
export function formatAgendaForCopy(items: RecommendedAgendaItem[]): string {
  return items
    .map((item, i) => {
      const minutes =
        item.estimated_minutes != null
          ? `（約${item.estimated_minutes}分）`
          : "";
      const head = `${i + 1}. ${item.title}${minutes}`;
      const reason =
        item.reason && item.reason.trim().length > 0
          ? `\n   理由: ${item.reason}`
          : "";
      return `${head}${reason}`;
    })
    .join("\n");
}
