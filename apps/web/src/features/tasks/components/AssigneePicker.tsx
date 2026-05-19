import { useOrganizationMembers } from "@/features/organizations/hooks/useOrganizationMembers";
import { cn } from "@/lib/utils";

// 担当者の複数選択ピッカー。組織メンバーをチェックボックスのトグルチップで表示し、
// チェック状態の userId 配列を value/onChange で受け渡す。
// API には pending 招待は含まれない（OrganizationMembership ベース）ので、
// 候補は確定メンバーのみ。
export function AssigneePicker({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { data, isLoading, isError } = useOrganizationMembers(organizationId);

  const toggle = (userId: string) => {
    const set = new Set(value);
    if (set.has(userId)) set.delete(userId);
    else set.add(userId);
    onChange(Array.from(set));
  };

  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground">メンバーを読み込み中...</p>
    );
  }
  if (isError) {
    return (
      <p className="text-xs text-destructive">メンバーの取得に失敗しました</p>
    );
  }
  const members = data ?? [];
  if (members.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">組織にメンバーがいません</p>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldset の legend がレイアウト崩れを起こすため div + role=group で代替（My タスクと同じ判断）
    <div className="flex flex-wrap gap-2" role="group" aria-label="担当者">
      {members.map((m) => {
        const checked = value.includes(m.userId);
        return (
          <label
            key={m.userId}
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
              onChange={() => toggle(m.userId)}
            />
            {m.displayName}
          </label>
        );
      })}
    </div>
  );
}
