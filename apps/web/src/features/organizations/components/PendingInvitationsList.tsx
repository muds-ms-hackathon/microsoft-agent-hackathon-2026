import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/features/organizations/components/RoleBadge";
import { usePendingInvitations } from "@/features/organizations/hooks/usePendingInvitations";
import { useRevokeInvitation } from "@/features/organizations/hooks/useRevokeInvitation";
import { useState } from "react";

// 組織詳細ページの「招待管理」セクション。owner/admin のみ表示される想定。
// 取消ボタン押下で DELETE → 一覧 invalidate。失敗時は該当行にエラーを表示する。
export function PendingInvitationsList({ orgId }: { orgId: string }) {
  const {
    data: invitations = [],
    isLoading,
    isError,
  } = usePendingInvitations(orgId);
  const revoke = useRevokeInvitation(orgId);
  // 取消失敗時にどの招待 id で失敗したかを行単位で表示するため id をキーに持つ。
  const [errorId, setErrorId] = useState<string | null>(null);

  const handleRevoke = (invitationId: string) => {
    setErrorId(null);
    revoke.mutate(invitationId, {
      onError: () => setErrorId(invitationId),
    });
  };

  return (
    <section aria-label="招待管理" className="space-y-3 rounded-md border p-4">
      <h2 className="text-lg font-semibold">招待管理</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      ) : isError ? (
        <p className="text-destructive text-sm">招待の取得に失敗しました</p>
      ) : invitations.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          ペンディング中の招待はありません
        </p>
      ) : (
        <ul aria-label="招待一覧" className="divide-y rounded-md border">
          {invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex flex-col gap-1">
                <span className="font-medium">{inv.email}</span>
                <span className="text-sm text-muted-foreground">
                  招待者: {inv.inviter.displayName} ({inv.inviter.email})
                </span>
                {errorId === inv.id && (
                  <span className="text-destructive text-sm">
                    取消に失敗しました
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <RoleBadge role={inv.role} />
                {inv.expired && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    期限切れ
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRevoke(inv.id)}
                  disabled={revoke.isPending && revoke.variables === inv.id}
                >
                  取消
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
