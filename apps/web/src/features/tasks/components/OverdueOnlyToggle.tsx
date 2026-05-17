import { cn } from "@/lib/utils";

// 「期限超過のみ」のクイックトグル。
// 視覚的には status フィルタのチップと同じスタイルで揃え、フィルタ行に並べたときに
// 違和感が出ないようにしている。押下状態は aria-pressed で表現する。
export function OverdueOnlyToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={value}
      onClick={() => onChange(!value)}
      className={cn(
        "text-xs px-2 py-1 rounded-md border cursor-pointer select-none",
        value
          ? "bg-foreground text-background border-foreground"
          : "bg-card text-foreground border-border/60 hover:bg-accent",
      )}
    >
      期限超過のみ
    </button>
  );
}
