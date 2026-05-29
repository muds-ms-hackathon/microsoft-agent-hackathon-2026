import { RefreshCw } from "lucide-react";

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="再試行"
      aria-label="再試行"
      className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
    >
      <RefreshCw size={14} />
    </button>
  );
}

export function SectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && <RetryButton onClick={onRetry} />}
    </div>
  );
}
