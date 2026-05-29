import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export type AnalysisRunStatus = "queued" | "analyzing" | "completed" | "failed";

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
  transcriptText: string | null;
  meetingType: string;
  recurringMeetingId: string | null;
  createdAt: string;
  recurringMeeting: { id: string; name: string };
  organization: { id: string; name: string };
  latestAnalysisRun: {
    id: string;
    status: AnalysisRunStatus;
    currentStep: string | null;
    summary: string | null;
    alertLevel: string | null;
    completedAt: string | null;
    failedAt: string | null;
    errorMessage: string | null;
    recommendedAgenda: string | null;
  } | null;
  memberCount: number;
  members: {
    userId: string;
    role: string;
    user: { id: string; name: string; displayName: string };
  }[];
};

// queued / analyzing 中は 3 秒ポーリング。それ以外は無効。
function refetchInterval(query: {
  state: { data?: MeetingDetail };
}): number | false {
  const status = query.state.data?.latestAnalysisRun?.status;
  return status === "queued" || status === "analyzing" ? 3000 : false;
}

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
    refetchInterval,
  });
}
