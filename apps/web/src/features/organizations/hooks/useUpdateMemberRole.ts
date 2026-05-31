import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type UpdateMemberRoleInput = {
  targetUserId: string;
  role: "admin" | "member";
};

// PATCH /organizations/:id/members/:userId の薄いラッパー（#124）。
// 変更後にメンバー一覧を invalidate して最新ロールを反映する。
export function useUpdateMemberRole(orgId: string, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ targetUserId, role }: UpdateMemberRoleInput) => {
      const res = await api.organizations[":id"].members[":userId"].$patch(
        { param: { id: orgId, userId: targetUserId }, json: { role } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to update member role: ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", orgId, "members"],
      });
      onSuccess?.();
    },
  });
}
