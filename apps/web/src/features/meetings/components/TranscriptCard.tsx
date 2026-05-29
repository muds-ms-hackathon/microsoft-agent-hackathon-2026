import { Card } from "@/components/ui/card";
import { useAnalyzeMeeting } from "@/features/meetings/hooks/useAnalyzeMeeting";
import type { AnalysisRunStatus } from "@/features/meetings/hooks/useMeetingDetail";
import { Loader2 } from "lucide-react";
import { useState } from "react";

const STATUS_LABELS: Partial<Record<AnalysisRunStatus, string>> = {
  queued: "解析待ち...",
  analyzing: "AIが解析中...",
};

export function TranscriptCard({
  meetingId,
  initialText,
  analysisStatus,
  errorMessage,
}: {
  meetingId: string;
  initialText: string | null;
  analysisStatus: AnalysisRunStatus | null;
  errorMessage?: string | null;
}) {
  const [text, setText] = useState(initialText ?? "");
  const {
    mutate: analyze,
    isPending,
    error: mutationError,
  } = useAnalyzeMeeting(meetingId);

  const isRunning =
    analysisStatus === "queued" || analysisStatus === "analyzing";
  const isFailed = analysisStatus === "failed";
  const displayError =
    mutationError?.message ?? (isFailed ? errorMessage : null);

  return (
    <Card aria-label="議事録" className="gap-0 py-0 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 bg-muted/40 border-b border-border/50 shrink-0">
        <span className="text-sm font-semibold flex-1">議事録</span>
        {isRunning && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            {STATUS_LABELS[analysisStatus]}
          </span>
        )}
        {isFailed && <span className="text-xs text-destructive">解析失敗</span>}
      </div>

      <div className="px-5 py-4 flex flex-col gap-3">
        {isRunning ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {STATUS_LABELS[analysisStatus]}
          </p>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="議事録（文字起こし）テキストをここに貼り付けてください"
              rows={10}
              className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {displayError && (
              <p className="text-sm text-destructive">{displayError}</p>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => analyze(text)}
                disabled={!text.trim() || isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    処理中...
                  </>
                ) : (
                  "解析を実行"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
