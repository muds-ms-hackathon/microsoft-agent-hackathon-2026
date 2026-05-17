import { useOrganizationMembers } from "@/features/organizations/hooks/useOrganizationMembers";

// 「未アサインのみ」を表す API センチネル。API 側 buildTaskListWhere と整合させる。
const UNASSIGNED_SENTINEL = "none";

// 担当者でタスクを絞り込むセレクタ。
// 値の意味:
//   - undefined / ""  → フィルタなし（すべて表示）
//   - "none"          → 未アサインのみ
//   - その他の文字列  → 該当 userId のタスクのみ
// 「自分のみ」は currentUserId をそのまま value にすることで実現する。
// メンバー一覧では currentUserId を除外し、UI 上の重複を避ける。
export function AssigneeFilter({
  orgId,
  value,
  onChange,
  currentUserId,
}: {
  orgId: string;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  currentUserId: string | null;
}) {
  const membersQuery = useOrganizationMembers(orgId);
  const members = membersQuery.data ?? [];
  const otherMembers = currentUserId
    ? members.filter((m) => m.userId !== currentUserId)
    : members;

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      担当者
      <select
        aria-label="担当者フィルタ"
        // controlled component。undefined は "" として扱い、「すべて」を選択状態にする。
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : v);
        }}
        className="text-xs px-2 py-1 rounded-md border border-border/60 bg-card text-foreground"
      >
        <option value="">すべて</option>
        <optgroup label="クイック選択">
          {currentUserId ? (
            <option value={currentUserId}>自分のみ</option>
          ) : null}
          <option value={UNASSIGNED_SENTINEL}>未アサイン</option>
        </optgroup>
        {otherMembers.length > 0 ? (
          <optgroup label="メンバー">
            {otherMembers.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.displayName}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </label>
  );
}
