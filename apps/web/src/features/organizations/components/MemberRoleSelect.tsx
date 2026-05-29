import { useUpdateMemberRole } from "@/features/organizations/hooks/useUpdateMemberRole";

// owner がメンバーの admin / member ロールを切り替える select（#124）。
// owner 対象・自分自身は呼び出し側で除外し、本コンポーネントは admin/member のみ受け取る。
export function MemberRoleSelect({
  orgId,
  targetUserId,
  role,
}: {
  orgId: string;
  targetUserId: string;
  role: "admin" | "member";
}) {
  const mutation = useUpdateMemberRole(orgId);

  return (
    <select
      aria-label="ロール変更"
      value={role}
      disabled={mutation.isPending}
      onChange={(e) => {
        const next = e.target.value as "admin" | "member";
        if (next !== role) {
          mutation.mutate({ targetUserId, role: next });
        }
      }}
      className="text-xs px-2 py-1 rounded-md border border-border/60 bg-card text-foreground disabled:opacity-50"
    >
      <option value="admin">管理者</option>
      <option value="member">メンバー</option>
    </select>
  );
}
