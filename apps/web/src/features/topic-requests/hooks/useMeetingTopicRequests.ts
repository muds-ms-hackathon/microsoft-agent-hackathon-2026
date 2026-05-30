import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { topicRequestQueryKeys } from "../queryKeys";
import type { TopicRequest } from "../types";

// 指定 meeting に紐づく次回議題の一覧を取得する。createdAt 昇順で返る。
export function useMeetingTopicRequests(meetingId: string) {
  return useQuery<TopicRequest[]>({
    queryKey: topicRequestQueryKeys.meeting(meetingId),
    queryFn: async () => {
      const res = await api.meetings[":id"]["topic-requests"].$get(
        { param: { id: meetingId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch topic requests: ${res.status}`);
      }
      return (await res.json()) as TopicRequest[];
    },
    enabled: meetingId !== "",
  });
}
