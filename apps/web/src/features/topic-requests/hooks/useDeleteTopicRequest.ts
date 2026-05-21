import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { topicRequestQueryKeys } from "../queryKeys";

// 次回議題を削除する mutation。成功時は当該 meeting の一覧キャッシュを invalidate する。
export function useDeleteTopicRequest(meetingId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await api["topic-requests"][":id"].$delete(
        { param: { id } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to delete topic request: ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: topicRequestQueryKeys.meeting(meetingId),
      });
    },
  });
}
