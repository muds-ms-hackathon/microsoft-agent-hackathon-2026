import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type InvitePayload = { email: string; role: "admin" | "member" };

// POST /organizations/:id/invite の薄いラッパー。
// 4xx/5xx を success として扱うと「招待したつもりが実は失敗」が起きるため明示的に throw する。
export function useInviteMember(orgId: string, onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: InvitePayload) => {
      const res = await api.organizations[":id"].invite.$post(
        { param: { id: orgId }, json: payload },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to invite member: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", orgId, "members"],
      });
      onSuccess?.();
    },
  });
}
