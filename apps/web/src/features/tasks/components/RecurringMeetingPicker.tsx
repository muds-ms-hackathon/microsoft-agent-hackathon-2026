import { useOrganizationMeetings } from "@/features/recurring-meetings/hooks/useOrganizationMeetings";
import { cn } from "@/lib/utils";

// 定例（プロジェクト相当）の複数選択ピッカー。
// 同一組織配下の定例だけを候補にする（API 側のクロス組織アタッチ禁止と整合）。
export function RecurringMeetingPicker({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { data, isLoading, isError } = useOrganizationMeetings(organizationId);

  const toggle = (rmId: string) => {
    const set = new Set(value);
    if (set.has(rmId)) set.delete(rmId);
    else set.add(rmId);
    onChange(Array.from(set));
  };

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">定例を読み込み中...</p>;
  }
  if (isError) {
    return <p className="text-xs text-destructive">定例の取得に失敗しました</p>;
  }
  const meetings = data ?? [];
  if (meetings.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">組織に定例がありません</p>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldset の legend がレイアウト崩れを起こすため div + role=group で代替（My タスクと同じ判断）
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="紐付ける定例"
    >
      {meetings.map((m) => {
        const checked = value.includes(m.id);
        return (
          <label
            key={m.id}
            className={cn(
              "text-xs px-2 py-1 rounded-md border cursor-pointer select-none",
              checked
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-foreground border-border/60 hover:bg-accent",
            )}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              onChange={() => toggle(m.id)}
            />
            {m.name}
          </label>
        );
      })}
    </div>
  );
}
