import { Card } from "@/components/ui/card";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

type RecommendedAgendaSectionProps = {
  // AI が生成した次回会議の推奨アジェンダ。未解析・未生成のときは null。
  agenda: string | null;
};

// 会議の解析結果（latestAnalysisRun.recommendedAgenda）として生成された
// 「次回会議の推奨アジェンダ」を表示し、クリップボードへコピーできるカード。
// トースト UI は未導入のため、コピー成否はボタン表示の差し替えでフィードバックする。
export function RecommendedAgendaSection({
  agenda,
}: RecommendedAgendaSectionProps) {
  const [copied, setCopied] = useState(false);

  // コピー後のフィードバックは一定時間で自動的に元へ戻す。
  // アンマウント時のタイマー解放も行う。
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const hasAgenda = agenda != null && agenda.trim().length > 0;

  const handleCopy = async () => {
    if (!hasAgenda) return;
    try {
      await navigator.clipboard.writeText(agenda);
      setCopied(true);
    } catch {
      // クリップボード API が使えない環境では何もしない（フィードバックも出さない）。
    }
  };

  return (
    <Card
      aria-label="次回会議の推奨アジェンダ"
      className="gap-0 py-0 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-5 py-3.5 bg-muted/40 border-b border-border/50 shrink-0">
        <span className="text-sm font-semibold flex-1">
          次回会議の推奨アジェンダ
        </span>
        {hasAgenda && (
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "コピーしました" : "コピー"}
          </button>
        )}
      </div>
      <div className="px-5 py-4">
        {hasAgenda ? (
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {agenda}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            推奨アジェンダはまだありません
          </p>
        )}
      </div>
    </Card>
  );
}
