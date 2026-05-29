import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useAgendaHistory } from "../hooks/useAgendaHistory";
import { AgendaCopyButton } from "./AgendaCopyButton";
import { AgendaItemList } from "./AgendaItemList";

type AgendaHistorySectionProps = {
  meetingId: string;
  // 過去の会議でのみ取得する（未来の会議では履歴は存在しない）。
  enabled?: boolean;
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 過去に生成された推奨アジェンダの履歴を、折りたたみ可能なカードで一覧表示する。
// 各版は閲覧・コピーできる（MVP では版の切替＝復元は行わない）。
// 履歴が 1 件以下のときは「現在の推奨アジェンダ」カードと重複するため表示しない。
export function AgendaHistorySection({
  meetingId,
  enabled = true,
}: AgendaHistorySectionProps) {
  const [open, setOpen] = useState(false);
  const { data, isError } = useAgendaHistory(meetingId, enabled);

  const entries = data ?? [];
  if (!isError && entries.length <= 1) return null;

  return (
    <Card
      aria-label="アジェンダ生成履歴"
      className="gap-0 py-0 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-5 py-3.5 bg-muted/40 border-b border-border/50 w-full text-left"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="text-sm font-semibold flex-1">アジェンダ生成履歴</span>
        {!isError && (
          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
            {entries.length}
          </span>
        )}
      </button>
      {open && (
        <div className="px-5 py-4 space-y-5">
          {isError ? (
            <p className="text-sm text-muted-foreground">
              履歴の取得に失敗しました
            </p>
          ) : (
            entries.map((entry, i) => (
              <div key={entry.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground flex-1">
                    {formatTimestamp(entry.completedAt ?? entry.createdAt)}
                    {i === 0 && "（最新）"}
                  </span>
                  <AgendaCopyButton agenda={entry.recommendedAgenda} />
                </div>
                <AgendaItemList items={entry.recommendedAgenda} />
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}
