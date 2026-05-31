// TanStack Query の queryKey factory。
// meeting に紐づく一覧キャッシュを invalidate しやすいよう、meeting ID をキーに含める。
export const topicRequestQueryKeys = {
  all: ["topic-requests"] as const,
  meeting: (meetingId: string) =>
    [...topicRequestQueryKeys.all, "meeting", meetingId] as const,
};
