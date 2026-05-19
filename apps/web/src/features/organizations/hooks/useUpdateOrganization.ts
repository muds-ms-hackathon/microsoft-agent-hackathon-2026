import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// PATCH /organizations/:id の薄いラッパー。
// 「変更があったフィールドのみ送る」ロジックはダイアログ側の責務として残し、
// このフックは「差分が無ければ null を返す / 送れば PATCH を叩く」の単純な振る舞いに留める。
export function useUpdateOrganization(orgId: string, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (json: { name?: string; description?: string }) => {
      // 変更が無い場合は API を呼ばず成功扱いで返す
      // （API 側の updateSchema が「name か description のどちらか必須」を要求するため、
      // 空ペイロードを送ると 400 になる）。
      if (json.name === undefined && json.description === undefined) {
        return null;
      }
      const res = await api.organizations[":id"].$patch(
        { param: { id: orgId }, json },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to update organization: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId] });
      onSuccess?.();
    },
  });
}
