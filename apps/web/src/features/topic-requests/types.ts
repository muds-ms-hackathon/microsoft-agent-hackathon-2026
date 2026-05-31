// TopicRequest 機能のフロント側型定義。
// API レスポンス (apps/api 側 prisma model) と整合する。

export type TopicRequestPriority = "required" | "optional";

export type TopicRequest = {
  id: string;
  meetingId: string;
  requestedBy: string;
  title: string;
  body: string | null;
  priority: TopicRequestPriority | null;
  createdAt: string;
  updatedAt: string;
};
