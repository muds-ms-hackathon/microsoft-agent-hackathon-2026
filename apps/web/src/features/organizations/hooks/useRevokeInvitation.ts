import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// DELETE /organizations/:id/invitations/:invitationId の薄いラッパー。
// 成功時に該当組織の招待一覧を invalidate して UI を即時更新する。
export function useRevokeInvitation(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await api.organizations[":id"].invitations[
        ":invitationId"
      ].$delete({ param: { id: orgId, invitationId } }, authHeaders());
      if (!res.ok) {
        throw new Error(`Failed to revoke invitation: ${res.status}`);
      }
      return invitationId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", orgId, "invitations"],
      });
    },
  });
}
