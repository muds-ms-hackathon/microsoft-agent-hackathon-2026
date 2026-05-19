import { useOrganizationMembers } from "@/features/organizations/hooks/useOrganizationMembers";

// 「未アサインのみ」を表す API センチネル。API 側 buildTaskListWhere と整合させる。
const UNASSIGNED_SENTINEL = "none";

// 担当者でタスクを絞り込むセレクタ。
// 値の意味:
//   - undefined / ""  → フィルタなし（すべて表示）
//   - "none"          → 未アサインのみ
//   - その他の文字列  → 該当 userId のタスクのみ
//
// 「自分のみ」は API には DB の `user.id` を渡す必要がある。JWT の `sub` は
// API ミドルウェアで User の externalId として扱われ、`user.id` とは別物のため、
// 認証情報の sub をそのまま value に使うと一致しない（タスクが 0 件になる）。
// このコンポーネントでは currentUserEmail を受け取り、組織メンバー一覧から
// email 一致で「自分」の userId を引き当てる。
export function AssigneeFilter({
  orgId,
  value,
  onChange,
  currentUserEmail,
}: {
  orgId: string;
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  currentUserEmail: string | null;
}) {
  const membersQuery = useOrganizationMembers(orgId);
  const members = membersQuery.data ?? [];
  const selfMember = currentUserEmail
    ? (members.find((m) => m.email === currentUserEmail) ?? null)
    : null;
  // メンバー一覧から自分を除外し、「自分のみ」option との重複を避ける。
  const otherMembers = selfMember
    ? members.filter((m) => m.userId !== selfMember.userId)
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
          {selfMember ? (
            <option value={selfMember.userId}>自分のみ</option>
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
