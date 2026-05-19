import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export type PendingInvitation = {
  id: string;
  email: string;
  role: "admin" | "member";
  status: "pending";
  expiresAt: string;
  createdAt: string;
  expired: boolean;
  inviter: { id: string; name: string; displayName: string; email: string };
};

// 組織の pending 招待一覧を取得するクエリ。
// owner/admin のみ呼び出せる前提で、UI 側で表示の出し分けを行う。
export function usePendingInvitations(orgId: string, enabled = true) {
  return useQuery<PendingInvitation[]>({
    queryKey: ["organizations", orgId, "invitations"],
    enabled,
    queryFn: async () => {
      const res = await api.organizations[":id"].invitations.$get(
        { param: { id: orgId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch invitations: ${res.status}`);
      }
      return (await res.json()) as PendingInvitation[];
    },
  });
}
