import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { DecisionGraph } from "./types";

// 会議の意思決定文脈グラフを取得する hook。
// クエリキーは ["meetings", id, "decision-graph"]（会議詳細系と同じ前置き）。
export function useDecisionGraph(id: string) {
  return useQuery<DecisionGraph>({
    queryKey: ["meetings", id, "decision-graph"],
    queryFn: async () => {
      const res = await api.meetings[":id"]["decision-graph"].$get(
        { param: { id } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch decision graph: ${res.status}`);
      }
      return (await res.json()) as DecisionGraph;
    },
  });
}
