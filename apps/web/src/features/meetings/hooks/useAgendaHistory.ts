import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { RecommendedAgendaItem } from "./useMeetingDetail";

// アジェンダ履歴の 1 エントリ。完了した解析ランから派生する。
export type AgendaHistoryEntry = {
  id: string;
  recommendedAgenda: RecommendedAgendaItem[];
  createdAt: string;
  completedAt: string | null;
};

// 指定 meeting の推奨アジェンダ生成履歴を新しい順で取得する。
export function useAgendaHistory(meetingId: string, enabled = true) {
  return useQuery<AgendaHistoryEntry[]>({
    queryKey: ["meetings", meetingId, "agenda-history"],
    queryFn: async () => {
      const res = await api.meetings[":id"]["agenda-history"].$get(
        { param: { id: meetingId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch agenda history: ${res.status}`);
      }
      return (await res.json()) as AgendaHistoryEntry[];
    },
    enabled: enabled && meetingId !== "",
  });
}
