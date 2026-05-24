import { api, authHeaders } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReviewItem } from "./types";

export type AmbiguityResolution =
  | { resolution: "task"; assigneeUserIds: string[]; dueDate: string | null; recurringMeetingIds: string[] }
  | { resolution: "decision_item" }
  | { resolution: "rejected" };

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

  const updateItem = async (
    id: string,
    updates: Partial<Omit<ReviewItem, "id">>,
  ): Promise<void> => {
    const item = (query.data ?? []).find((i) => i.id === id);

    if (item?.sourceTable === "decision_item") {
      const body: Record<string, unknown> = { version: item.version };
      if (updates.status !== undefined) body.status = updates.status;
      if (updates.title !== undefined) body.title = updates.title;
      if (updates.body !== undefined) body.body = updates.body;
      if (updates.assignees !== undefined) {
        body.assigneeUserIds = updates.assignees.map((a) => a.id);
      }
      if (updates.deadline !== undefined) {
        body.decisionDeadline = updates.deadline
          ? `${updates.deadline.slice(0, 10)}T00:00:00.000Z`
          : null;
      }

      const res = await api["decision-items"][":id"].$patch(
        { param: { id }, json: body as Parameters<typeof api["decision-items"][":id"]["$patch"]>[0]["json"] },
        authHeaders(),
      );

      if (res.status === 409) {
        await queryClient.invalidateQueries({ queryKey });
        throw new Error("他のユーザーが先に更新しました。最新の状態を取得しました。");
      }
      if (!res.ok) {
        throw new Error(`更新に失敗しました (${res.status})`);
      }

      const updated = (await res.json()) as ReviewItem;
      queryClient.setQueryData<ReviewItem[]>(queryKey, (prev) =>
        (prev ?? []).map((i) => (i.id === id ? updated : i)),
      );
      return;
    }

    // task など他 sourceTable はキャッシュ更新のみ。
    queryClient.setQueryData<ReviewItem[]>(queryKey, (prev) =>
      (prev ?? []).map((i) => (i.id === id ? { ...i, ...updates } : i)),
    );
  };

  const resolveAmbiguity = async (
    id: string,
    params: AmbiguityResolution,
  ): Promise<void> => {
    const item = (query.data ?? []).find((i) => i.id === id);
    if (!item) return;

    type PatchBody = Parameters<typeof api["ambiguous-infos"][":id"]["$patch"]>[0]["json"];
    let body: PatchBody;
    if (params.resolution === "rejected") {
      body = { version: item.version, status: "rejected" };
    } else if (params.resolution === "task") {
      body = {
        version: item.version,
        resolutionType: "task",
        newTask: {
          assigneeUserIds: params.assigneeUserIds.length > 0 ? params.assigneeUserIds : undefined,
          dueDate: params.dueDate ? `${params.dueDate.slice(0, 10)}T00:00:00.000Z` : undefined,
          recurringMeetingIds: params.recurringMeetingIds.length > 0 ? params.recurringMeetingIds : undefined,
        },
      };
    } else {
      body = { version: item.version, resolutionType: "decision_item" };
    }

    const res = await api["ambiguous-infos"][":id"].$patch(
      { param: { id }, json: body },
      authHeaders(),
    );

    if (res.status === 409) {
      await queryClient.invalidateQueries({ queryKey });
      throw new Error("他のユーザーが先に更新しました。最新の状態を取得しました。");
    }
    if (!res.ok) {
      throw new Error(`更新に失敗しました (${res.status})`);
    }

    const updated = (await res.json()) as ReviewItem;
    queryClient.setQueryData<ReviewItem[]>(queryKey, (prev) =>
      (prev ?? []).map((i) => (i.id === id ? updated : i)),
    );
  };

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    updateItem,
    resolveAmbiguity,
  };
}
