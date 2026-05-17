import { useOrganizationMeetings } from "@/features/recurring-meetings/hooks/useOrganizationMeetings";

// 定例（プロジェクト相当）の複数選択ピッカー。
// 「どのプロジェクトに紐付けるか」の選択操作を分かりやすくするため、
// 可視のチェックボックス UI を採用する（担当者ピッカーの chip スタイルとは
// 意図的に区別する: 人タグ vs プロジェクト紐付け）。
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
    // 定例の数が増えてもダイアログ高さが破綻しないよう、
    // 6 件超で内部スクロールにする。グリッドは sm 以上で 2 列にして密度を保つ。
    // biome-ignore lint/a11y/useSemanticElements: fieldset の legend がレイアウト崩れを起こすため div + role=group で代替
    <div
      role="group"
      aria-label="紐付ける定例"
      className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto rounded-md border border-border/40 p-2"
    >
      {meetings.map((m) => {
        const checked = value.includes(m.id);
        return (
          <label
            key={m.id}
            className="flex items-center gap-2 text-sm cursor-pointer select-none px-1.5 py-1 rounded hover:bg-accent"
          >
            {/* 可視のチェックボックス。ブラウザ既定 UI を尊重しつつ、
                accent-color でアプリのテーマカラーに揃える。 */}
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(m.id)}
              className="h-4 w-4 cursor-pointer accent-foreground"
            />
            <span className="truncate">{m.name}</span>
          </label>
        );
      })}
    </div>
  );
}
