import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// 議事録テキストを保存して AI 解析をトリガーする。
// Step1: PATCH /meetings/:id (transcriptText 保存)
// Step2: POST /meetings/:id/analyze (解析キック)
export function useAnalyzeMeeting(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transcriptText: string) => {
      const patchRes = await api.meetings[":id"].$patch(
        { param: { id: meetingId }, json: { transcriptText } },
        authHeaders(),
      );
      if (!patchRes.ok) {
        const body = await patchRes.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "議事録の保存に失敗しました");
      }

      const analyzeRes = await api.meetings[":id"].analyze.$post(
        { param: { id: meetingId } },
        authHeaders(),
      );
      if (!analyzeRes.ok) {
        const body = await analyzeRes.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "解析の実行に失敗しました");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["meetings", meetingId, "detail"],
      });
    },
  });
}
