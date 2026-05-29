import { Card } from "@/components/ui/card";
import type { RecommendedAgendaItem } from "../hooks/useMeetingDetail";
import { AgendaCopyButton } from "./AgendaCopyButton";
import { AgendaItemList } from "./AgendaItemList";

type RecommendedAgendaSectionProps = {
  // AI が生成した次回会議の推奨アジェンダ項目。未解析・未生成のときは null。
  agenda: RecommendedAgendaItem[] | null;
};

// 会議の解析結果（latestAnalysisRun.recommendedAgenda）として生成された
// 「次回会議の推奨アジェンダ」を表示し、クリップボードへコピーできるカード。
export function RecommendedAgendaSection({
  agenda,
}: RecommendedAgendaSectionProps) {
  const hasAgenda = agenda != null && agenda.length > 0;

  return (
    <Card
      aria-label="次回会議の推奨アジェンダ"
      className="gap-0 py-0 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-5 py-3.5 bg-muted/40 border-b border-border/50 shrink-0">
        <span className="text-sm font-semibold flex-1">
          次回会議の推奨アジェンダ
        </span>
        {hasAgenda && <AgendaCopyButton agenda={agenda} />}
      </div>
      <div className="px-5 py-4">
        {hasAgenda ? (
          <AgendaItemList items={agenda} />
        ) : (
          <p className="text-sm text-muted-foreground">
            推奨アジェンダはまだありません
          </p>
        )}
      </div>
    </Card>
  );
}
