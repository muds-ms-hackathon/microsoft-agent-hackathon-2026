import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

// ダッシュボード「次回会議」セクション用の応答型。
// GET /organizations/:id/next-meetings はサーバ側で recurringMeeting.name を
// 平坦化し、recurringMeetingName としてフラットに返している。
export type NextMeetingItem = {
  id: string;
  title: string;
  heldAt: string;
  estimatedDurationMinutes: number | null;
  recurringMeetingId: string | null;
  recurringMeetingName: string | null;
};

// 組織配下の upcoming な会議を limit 件まで 1 リクエストで取得する hook。
// 旧実装の useQueries による N+1 を解消するために導入。
// orgId が null の場合は API を呼ばずに無効化する。
// limit を queryKey に含め、表示件数が変わった際に独立したキャッシュとして扱う。
export function useOrganizationNextMeetings(
  orgId: string | null,
  limit: number,
) {
  return useQuery<NextMeetingItem[]>({
    queryKey: ["organizations", orgId ?? "__none__", "next-meetings", limit],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await api.organizations[":id"]["next-meetings"].$get(
        { param: { id: orgId }, query: { limit: String(limit) } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch next meetings: ${res.status}`);
      }
      return (await res.json()) as NextMeetingItem[];
    },
    enabled: orgId !== null,
  });
}
