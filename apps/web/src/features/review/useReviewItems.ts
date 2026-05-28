import { api, authHeaders } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReviewItem } from "./types";

export type AmbiguityResolution =
  | {
      resolution: "task";
      assigneeUserIds: string[];
      dueDate: string | null;
      recurringMeetingIds: string[];
    }
  | { resolution: "decision_item" }
  | { resolution: "rejected" };

type ReviewItemStatus = "pending" | "all" | "decided";

export function reviewItemsQueryKey(params: {
  meetingId?: string;
  recurringMeetingId?: string;
  organizationId?: string;
  status?: ReviewItemStatus;
}) {
  const status = params.status ?? "pending";
  if (params.meetingId) {
    return ["meetings", params.meetingId, "review-items", status] as const;
  }
  if (params.recurringMeetingId) {
    return [
      "recurring-meetings",
      params.recurringMeetingId,
      "review-items",
      status,
    ] as const;
  }
  return [
    "organizations",
    params.organizationId ?? "_none",
    "review-items",
    status,
  ] as const;
}

export function useReviewItems({
  meetingId,
  recurringMeetingId,
  organizationId,
  status,
}: {
  meetingId?: string;
  recurringMeetingId?: string;
  organizationId?: string;
  status?: ReviewItemStatus;
}) {
  const queryClient = useQueryClient();
  const queryKey = reviewItemsQueryKey({
    meetingId,
    recurringMeetingId,
    organizationId,
    status,
  });
  const statusQuery = status && status !== "pending" ? { status } : {};

  const query = useQuery<ReviewItem[]>({
    queryKey,
    queryFn: async () => {
      let res: Response;
      if (meetingId) {
        res = await api.meetings[":id"]["review-items"].$get(
          { param: { id: meetingId }, query: statusQuery },
          authHeaders(),
        );
      } else if (recurringMeetingId) {
        res = await api["recurring-meetings"][":id"]["review-items"].$get(
          { param: { id: recurringMeetingId }, query: statusQuery },
          authHeaders(),
        );
      } else {
        res = await api.organizations[":id"]["review-items"].$get(
          { param: { id: organizationId ?? "" }, query: statusQuery },
          authHeaders(),
        );
      }
      if (!res.ok) {
        throw new Error(`Failed to fetch review items: ${res.status}`);
      }
      return (await res.json()) as ReviewItem[];
    },
    enabled: !!(meetingId || recurringMeetingId || organizationId),
  });

  const updateItem = async (
    id: string,
    updates: Partial<Omit<ReviewItem, "id">>,
  ): Promise<void> => {
    const item = (query.data ?? []).find((i) => i.id === id);

    if (item?.sourceTable === "decision_item") {
      const body: Record<string, unknown> = { version: item.version };
      if (updates.status !== undefined) {
        if (updates.status === "rejected") {
          body.status = "cancelled";
        } else if (updates.status === "decided" && item.type === "open_issue") {
          // 未決事項の承認は "open"（未決確定）に対応する
          body.status = "open";
          body.decisionState = "confirmed";
        } else {
          body.status = updates.status;
        }
      }
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
        {
          param: { id },
          json: body as Parameters<
            (typeof api)["decision-items"][":id"]["$patch"]
          >[0]["json"],
        },
        authHeaders(),
      );

      if (res.status === 409) {
        await queryClient.invalidateQueries({ queryKey });
        throw new Error(
          "他のユーザーが先に更新しました。最新の状態を取得しました。",
        );
      }
      if (!res.ok) {
        throw new Error(`更新に失敗しました (${res.status})`);
      }

      const updated = (await res.json()) as ReviewItem;
      const isPending =
        updated.status === "draft" || updated.status === "reviewing";
      queryClient.setQueryData<ReviewItem[]>(queryKey, (prev) =>
        isPending
          ? (prev ?? []).map((i) => (i.id === id ? updated : i))
          : (prev ?? []).filter((i) => i.id !== id),
      );
      return;
    }

    if (item?.sourceTable === "task") {
      const body: Record<string, unknown> = { version: item.version };

      if (updates.status === "decided") {
        body.status = "todo";
        // AI 作成時点では TaskRecurringMeeting が未作成のため確定時に紐付ける
        body.recurringMeetingIds = [item.recurringMeetingId];
      } else if (updates.status === "rejected") body.status = "rejected";

      if (updates.title !== undefined) body.title = updates.title;
      if (updates.assignees !== undefined) {
        body.assigneeUserIds = updates.assignees.map((a) => a.id);
      }
      if (updates.deadline !== undefined) {
        body.dueDate = updates.deadline
          ? `${updates.deadline.slice(0, 10)}T00:00:00.000Z`
          : null;
      }

      const res = await api.tasks[":id"].$patch(
        {
          param: { id },
          json: body as Parameters<
            (typeof api.tasks)[":id"]["$patch"]
          >[0]["json"],
        },
        authHeaders(),
      );

      if (res.status === 409) {
        await queryClient.invalidateQueries({ queryKey });
        throw new Error(
          "他のユーザーが先に更新しました。最新の状態を取得しました。",
        );
      }
      if (!res.ok) {
        throw new Error(`更新に失敗しました (${res.status})`);
      }

      const task = (await res.json()) as {
        id: string;
        title: string;
        status: string;
        assignees: {
          id: string;
          name: string;
          displayName: string;
          email: string;
        }[];
        dueDate: string | null;
        version: number;
      };

      const reviewStatus: ReviewItem["status"] =
        task.status === "rejected"
          ? "rejected"
          : task.status === "draft" || task.status === "reviewing"
            ? item.status
            : "decided";

      const isTaskPending =
        reviewStatus === "draft" || reviewStatus === "reviewing";
      queryClient.setQueryData<ReviewItem[]>(queryKey, (prev) =>
        isTaskPending
          ? (prev ?? []).map((i) =>
              i.id === id
                ? {
                    ...i,
                    title: task.title,
                    assignees: task.assignees,
                    deadline: task.dueDate,
                    version: task.version,
                    status: reviewStatus,
                  }
                : i,
            )
          : (prev ?? []).filter((i) => i.id !== id),
      );
      return;
    }

    if (!item) throw new Error(`updateItem: id="${id}" が見つかりません`);
    throw new Error(`updateItem: 未対応の sourceTable="${item.sourceTable}"`);
  };

  const resolveAmbiguity = async (
    id: string,
    params: AmbiguityResolution,
  ): Promise<void> => {
    const item = (query.data ?? []).find((i) => i.id === id);
    if (!item) throw new Error(`resolveAmbiguity: id="${id}" が見つかりません`);

    type PatchBody = Parameters<
      (typeof api)["ambiguous-infos"][":id"]["$patch"]
    >[0]["json"];
    let body: PatchBody;
    if (params.resolution === "rejected") {
      body = { version: item.version, status: "rejected" };
    } else if (params.resolution === "task") {
      body = {
        version: item.version,
        resolutionType: "task",
        newTask: {
          assigneeUserIds:
            params.assigneeUserIds.length > 0
              ? params.assigneeUserIds
              : undefined,
          dueDate: params.dueDate
            ? `${params.dueDate.slice(0, 10)}T00:00:00.000Z`
            : undefined,
          recurringMeetingIds:
            params.recurringMeetingIds.length > 0
              ? params.recurringMeetingIds
              : undefined,
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
      throw new Error(
        "他のユーザーが先に更新しました。最新の状態を取得しました。",
      );
    }
    if (!res.ok) {
      throw new Error(`更新に失敗しました (${res.status})`);
    }

    const updated = (await res.json()) as ReviewItem;
    const isAmbigPending =
      updated.status === "draft" || updated.status === "reviewing";
    queryClient.setQueryData<ReviewItem[]>(queryKey, (prev) =>
      isAmbigPending
        ? (prev ?? []).map((i) => (i.id === id ? updated : i))
        : (prev ?? []).filter((i) => i.id !== id),
    );
  };

  const resetToPending = async (id: string): Promise<void> => {
    const item = (query.data ?? []).find((i) => i.id === id);
    if (!item) throw new Error(`resetToPending: id="${id}" が見つかりません`);

    if (item.sourceTable === "decision_item") {
      const body: Record<string, unknown> = {
        version: item.version,
        status: "draft",
      };
      if (item.type === "open_issue") body.decisionState = "open";

      const res = await api["decision-items"][":id"].$patch(
        {
          param: { id },
          json: body as Parameters<
            (typeof api)["decision-items"][":id"]["$patch"]
          >[0]["json"],
        },
        authHeaders(),
      );
      if (!res.ok) throw new Error(`更新に失敗しました (${res.status})`);
      await queryClient.invalidateQueries({ queryKey });
      return;
    }

    if (item.sourceTable === "task") {
      const res = await api.tasks[":id"].$patch(
        {
          param: { id },
          json: { version: item.version, status: "draft" } as Parameters<
            (typeof api.tasks)[":id"]["$patch"]
          >[0]["json"],
        },
        authHeaders(),
      );
      if (!res.ok) throw new Error(`更新に失敗しました (${res.status})`);
      await queryClient.invalidateQueries({ queryKey });
      return;
    }

    throw new Error(
      `resetToPending: 未対応の sourceTable="${item.sourceTable}"`,
    );
  };

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    updateItem,
    resolveAmbiguity,
    resetToPending,
  };
}
