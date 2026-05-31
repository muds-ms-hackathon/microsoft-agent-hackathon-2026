import { api, authHeaders } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";

// DELETE /organizations/:id/membership の薄いラッパー（#125・退会）。
// 退会成功後は組織一覧へ遷移する責務を呼び出し側が持つため、ここでは invalidate せず
// onSuccess に委ねる（組織詳細ページ自体が見えなくなる前提）。
export function useLeaveOrganization(orgId: string, onSuccess?: () => void) {
  return useMutation({
    mutationFn: async () => {
      const res = await api.organizations[":id"].membership.$delete(
        { param: { id: orgId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to leave organization: ${res.status}`);
      }
    },
    onSuccess,
  });
}
