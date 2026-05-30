import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, authHeaders } from "@/lib/api";

// 表示名 (displayName) を更新するミューテーションフック。
// 成功時に自分のプロフィールクエリを無効化して最新化する。
export function useUpdateDisplayName() {
  const queryClient = useQueryClient();
  return useMutation<
    { id: string; email: string; name: string; displayName: string },
    Error,
    string
  >({
    mutationFn: async (displayName) => {
      const res = await api.me.$patch({ json: { displayName } }, authHeaders());
      if (!res.ok) {
        throw new Error(`Failed to update display name: ${res.status}`);
      }
      return (await res.json()) as {
        id: string;
        email: string;
        name: string;
        displayName: string;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me", "profile"] });
    },
  });
}
