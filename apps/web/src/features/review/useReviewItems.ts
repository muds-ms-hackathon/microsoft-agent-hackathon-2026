import { api, authHeaders } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReviewItem } from "./types";

export function reviewItemsQueryKey(params: {
  meetingId?: string;
  recurringMeetingId?: string;
}) {
  if (params.meetingId) {
    return ["meetings", params.meetingId, "review-items"] as const;
  }
  return ["recurring-meetings", params.recurringMeetingId, "review-items"] as const;
}

export function useReviewItems({
  meetingId,
  recurringMeetingId,
}: {
  meetingId?: string;
  recurringMeetingId?: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = reviewItemsQueryKey({ meetingId, recurringMeetingId });

  const query = useQuery<ReviewItem[]>({
    queryKey,
    queryFn: async () => {
      let res: Response;
      if (meetingId) {
        res = await api.meetings[":id"]["review-items"].$get(
          { param: { id: meetingId }, query: {} },
          authHeaders(),
        );
      } else {
        res = await api["recurring-meetings"][":id"]["review-items"].$get(
          { param: { id: recurringMeetingId! }, query: {} },
          authHeaders(),
        );
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch review items: ${res.status}`);
      }
      return (await res.json()) as ReviewItem[];
    },
    enabled: !!(meetingId || recurringMeetingId),
  });

  // Step 3-4 で PATCH API コールに置き換える。現時点はキャッシュのみ更新。
  const updateItem = (id: string, updates: Partial<Omit<ReviewItem, "id">>) => {
    queryClient.setQueryData<ReviewItem[]>(queryKey, (prev) =>
      (prev ?? []).map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  };

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    updateItem,
  };
}
