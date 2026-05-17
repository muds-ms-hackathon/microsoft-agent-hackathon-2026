import type { RecurringMeeting } from "@/features/organizations/types";
import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

// 定例詳細レスポンス。GET /recurring-meetings/:id は members 一覧も返すが、
// 本 hook は会議一覧画面のヘッダ用なので最小限の型に絞っておく。
export type RecurringMeetingDetail = RecurringMeeting & {
  members: Array<{
    userId: string;
    name: string;
    displayName: string;
    email: string;
    role: "owner" | "member";
    joinedAt: string;
  }>;
};

// 単一定例の詳細を取得する hook。
// クエリキーは ["recurring-meetings", id, "detail"] とし、配下会議一覧と区別する。
export function useRecurringMeetingDetail(id: string) {
  return useQuery<RecurringMeetingDetail>({
    queryKey: ["recurring-meetings", id, "detail"],
    queryFn: async () => {
      const res = await api["recurring-meetings"][":id"].$get(
        { param: { id } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch recurring meeting: ${res.status}`);
      }
      return (await res.json()) as RecurringMeetingDetail;
    },
  });
}
