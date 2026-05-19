import { api, authHeaders } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";

// DELETE /organizations/:id の薄いラッパー。
// 削除成功後は親側が一覧に遷移する責務を持つため、ここでは invalidate を行わない
// （ページ自体が消える前提）。遷移は呼び出し側の onSuccess で行う。
export function useDeleteOrganization(orgId: string, onSuccess?: () => void) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.organizations[":id"].$delete(
        { param: { id: orgId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to delete organization: ${res.status}`);
      }
    },
    onSuccess,
  });
}
