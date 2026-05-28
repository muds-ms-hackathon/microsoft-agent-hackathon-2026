import { RefreshCw } from "lucide-react";

export function RetryButton({ onClick }: { onClick: () => void }) {
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
