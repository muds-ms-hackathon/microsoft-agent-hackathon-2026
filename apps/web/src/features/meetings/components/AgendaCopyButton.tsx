import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { formatAgendaForCopy } from "../agenda";
import type { RecommendedAgendaItem } from "../hooks/useMeetingDetail";

type AgendaCopyButtonProps = {
  agenda: RecommendedAgendaItem[];
};

// 推奨アジェンダを整形してクリップボードへコピーするボタン。
// トースト UI 未導入のため、コピー成否はラベル差し替えでフィードバックする。
// 現在のアジェンダ・履歴の各エントリで独立した状態を持てるよう、単体で切り出している。
export function AgendaCopyButton({ agenda }: AgendaCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatAgendaForCopy(agenda));
      setCopied(true);
    } catch {
      // クリップボード API が使えない環境では何もしない。
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "コピーしました" : "コピー"}
    </button>
  );
}
