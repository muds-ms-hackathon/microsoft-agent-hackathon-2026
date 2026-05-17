import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

// 定例配下の Meeting 一覧（GET /recurring-meetings/:id/meetings のレスポンス型）。
// API 側は select で 5 フィールドに限定して返している。
export type MeetingListItem = {
  id: string;
  title: string;
  heldAt: string;
  estimatedDurationMinutes: number | null;
  recurringMeetingId: string | null;
};

// 定例配下の会議一覧を取得する hook。
// クエリキーは ["recurring-meetings", id, "meetings"] で、作成ダイアログから invalidate される。
export function useRecurringMeetingMeetings(id: string) {
  return useQuery<MeetingListItem[]>({
    queryKey: ["recurring-meetings", id, "meetings"],
    queryFn: async () => {
      const res = await api["recurring-meetings"][":id"].meetings.$get(
        { param: { id } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch meetings: ${res.status}`);
      }
      return (await res.json()) as MeetingListItem[];
    },
  });
}
