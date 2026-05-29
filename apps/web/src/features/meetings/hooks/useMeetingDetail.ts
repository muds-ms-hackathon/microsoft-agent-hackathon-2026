import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

// AI が生成する推奨アジェンダの 1 項目。
// 実体は MeetingAnalysisRun.recommendedAgenda（JSON 配列）で、AI 出力のブレに備え
// title 以外は欠落/ null を許容する。
export type RecommendedAgendaItem = {
  title: string;
  estimated_minutes?: number | null;
  reason?: string | null;
};

// 会議詳細レスポンス。API 側 (apps/api/src/routes/meetings.ts) の整形に揃える。
export type MeetingDetail = {
  id: string;
  title: string;
  heldAt: string;
  estimatedDurationMinutes: number | null;
  estimationNote: string | null;
  sequenceNumber: number | null;
  previousMeetingId: string | null;
  transcriptionQuality: string | null;
  supplementaryMemo: string | null;
  meetingType: string;
  recurringMeetingId: string | null;
  createdAt: string;
  recurringMeeting: { id: string; name: string };
  organization: { id: string; name: string };
  latestAnalysisRun: {
    id: string;
    status: string;
    summary: string | null;
    recommendedAgenda: RecommendedAgendaItem[] | null;
    alertLevel: string | null;
    completedAt: string | null;
  } | null;
  memberCount: number;
  members: {
    userId: string;
    role: string;
    user: { id: string; name: string; displayName: string };
  }[];
};

// 会議詳細を取得する hook。クエリキーは ["meetings", id, "detail"]。
export function useMeetingDetail(id: string) {
  return useQuery<MeetingDetail>({
    queryKey: ["meetings", id, "detail"],
    queryFn: async () => {
      const res = await api.meetings[":id"].$get(
        { param: { id } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch meeting: ${res.status}`);
      }
      return (await res.json()) as MeetingDetail;
    },
  });
}
