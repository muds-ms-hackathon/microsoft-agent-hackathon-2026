import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { topicRequestQueryKeys } from "../queryKeys";
import type { TopicRequestPriority, TopicRequest } from "../types";

// API に送る形。priority 未指定は undefined で送り、サーバー側で null として保存される。
export type CreateTopicRequestPayload = {
  title: string;
  body?: string;
  priority?: TopicRequestPriority;
};

// 次回議題を作成する mutation。
// 成功時は当該 meeting の一覧キャッシュを invalidate する。
export function useCreateTopicRequest(meetingId: string) {
  const queryClient = useQueryClient();

  return useMutation<TopicRequest, Error, CreateTopicRequestPayload>({
    mutationFn: async (input) => {
      const res = await api.meetings[":id"]["topic-requests"].$post(
        { param: { id: meetingId }, json: input },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to create topic request: ${res.status}`);
      }
      return (await res.json()) as TopicRequest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: topicRequestQueryKeys.meeting(meetingId),
      });
    },
  });
}
