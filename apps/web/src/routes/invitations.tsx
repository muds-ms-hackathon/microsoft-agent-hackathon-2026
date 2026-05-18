import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RoleBadge } from "@/features/organizations/components/RoleBadge";
import { api, authHeaders } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/invitations")({
  component: InvitationsPage,
});

type Invitation = {
  id: string;
  role: "admin" | "member";
  expiresAt: string;
  createdAt: string;
  organization: { id: string; name: string };
  inviter: { id: string; name: string; displayName: string; email: string };
};

// 招待一覧クエリの key。受諾 (mutation) 成功時に組織一覧と一緒に invalidate する。
const INVITATIONS_QUERY_KEY = ["me", "invitations"] as const;

export function InvitationsPage() {
  const queryClient = useQueryClient();
  // 受諾失敗時に「どの招待 id」がエラーになったかを行単位で表示するため、id をキーに持つ。
  const [acceptErrorId, setAcceptErrorId] = useState<string | null>(null);

  const {
    data: invitations = [],
    isLoading,
    isError,
  } = useQuery<Invitation[]>({
    queryKey: INVITATIONS_QUERY_KEY,
    queryFn: async () => {
      const res = await api.me.invitations.$get(undefined, authHeaders());
      if (!res.ok) {
        throw new Error(`Failed to fetch invitations: ${res.status}`);
      }
      return (await res.json()) as Invitation[];
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      const res = await api.organizations[":id"].join.$post(
        { param: { id: organizationId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to accept invitation: ${res.status}`);
      }
      return organizationId;
    },
    onSuccess: () => {
      // 招待一覧と組織一覧の双方を再取得する。組織側はサイドバー等での
      // 「所属組織」表示を即時更新するために必須。
      queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setAcceptErrorId(null);
    },
    onError: (_err, organizationId) => {
      setAcceptErrorId(organizationId);
    },
  });

  return (
    <section
      aria-labelledby="invitations-title"
      className="container mx-auto p-8 space-y-6"
    >
      <header className="space-y-2">
        <h1 id="invitations-title" className="text-2xl font-bold">
          招待
        </h1>
        <p className="text-muted-foreground text-sm">
          自分宛に届いている組織への招待を確認し、受諾できます。
        </p>
      </header>

      {isLoading ? (
        <p>読み込み中...</p>
      ) : isError ? (
        <p>取得に失敗しました</p>
      ) : invitations.length === 0 ? (
        <p className="text-muted-foreground">受信中の招待はありません</p>
      ) : (
        <ul aria-label="招待一覧" className="space-y-3">
          {invitations.map((inv) => (
            <li key={inv.id}>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <CardTitle className="text-base">
                        {inv.organization.name}
                      </CardTitle>
                      <CardDescription>
                        招待者: {inv.inviter.displayName} ({inv.inviter.email})
                      </CardDescription>
                      <CardDescription>
                        期限:{" "}
                        {new Date(inv.expiresAt).toLocaleDateString("ja-JP")}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3">
                      <RoleBadge role={inv.role} />
                      <Button
                        onClick={() =>
                          acceptMutation.mutate(inv.organization.id)
                        }
                        disabled={
                          acceptMutation.isPending &&
                          acceptMutation.variables === inv.organization.id
                        }
                      >
                        受諾
                      </Button>
                    </div>
                  </div>
                  {acceptErrorId === inv.organization.id && (
                    <p className="text-destructive text-sm">
                      受諾に失敗しました
                    </p>
                  )}
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
