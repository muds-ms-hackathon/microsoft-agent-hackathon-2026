import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// DELETE /organizations/:id/members/:userId の薄いラッパー。
// 削除後に member 一覧を refetch するため、orgId をクエリキーに含めて invalidate する。
export function useRemoveMember(orgId: string, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const res = await api.organizations[":id"].members[":userId"].$delete(
        { param: { id: orgId, userId: targetUserId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to delete member: ${res.status}`);
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
