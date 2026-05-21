import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { topicRequestQueryKeys } from "../queryKeys";
import type { TopicRequest, TopicRequestPriority } from "../types";

// PATCH 用 payload。body / priority は null 送出で「未指定にクリア」を表現する。
export type UpdateTopicRequestPayload = {
  title?: string;
  body?: string | null;
  priority?: TopicRequestPriority | null;
};

export type UpdateTopicRequestVariables = {
  id: string;
  patch: UpdateTopicRequestPayload;
};

// 次回議題を更新する mutation。一覧キャッシュを invalidate する。
export function useUpdateTopicRequest(meetingId: string) {
  const queryClient = useQueryClient();

  return useMutation<TopicRequest, Error, UpdateTopicRequestVariables>({
    mutationFn: async ({ id, patch }) => {
      const res = await api["topic-requests"][":id"].$patch(
        { param: { id }, json: patch },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to update topic request: ${res.status}`);
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
