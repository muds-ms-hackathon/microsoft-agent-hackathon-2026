import type { RecurringMeeting } from "@/features/organizations/types";
import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

// 一覧 API は _count.members とアバター用の先頭5件 members を返す。
export type RecurringMeetingListItem = RecurringMeeting & {
  _count: { members: number };
  members: {
    userId: string;
    role: string;
    user: { id: string; name: string; displayName: string };
  }[];
};

// 組織配下の定例一覧を取得する hook。
// クエリキーは ["organizations", orgId, "meetings"] で固定し、作成・編集・削除ダイアログ側の
// invalidate と整合させる。orgId が null の場合は API を呼ばずに無効化する。
export function useOrganizationMeetings(orgId: string | null) {
  return useQuery<RecurringMeetingListItem[]>({
    queryKey: ["organizations", orgId ?? "__none__", "meetings"],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await api.organizations[":id"].meetings.$get(
        { param: { id: orgId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch recurring meetings: ${res.status}`);
      }
      return (await res.json()) as RecurringMeetingListItem[];
    },
    enabled: orgId !== null,
  });
}
