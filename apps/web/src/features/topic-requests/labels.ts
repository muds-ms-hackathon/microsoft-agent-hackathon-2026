import type { TopicRequestPriority } from "./types";

// priority 表示用ラベル。AI 仕様の Task.priority と意味を揃えている。
export const topicRequestPriorityLabels: Record<TopicRequestPriority, string> =
  {
    required: "必須",
    optional: "任意",
  };
