import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";

// Hono RPC の GET /organizations 200 レスポンス型をそのまま使う。
// API ハンドラ側の戻り値が変わるとここで型エラーが顕在化するため、
// フロントの as Organization[] キャストを避け型安全性を保てる。
// 日時フィールドは Hono RPC のシリアライズで string になる点に注意。
export type OrganizationListItem = InferResponseType<
  typeof api.organizations.$get,
  200
>[number];

// 組織一覧クエリの共通フック。
// Sidebar と /organizations 一覧ページで同一のクエリキー・fetcher を共有することで
// 一方の invalidate がもう一方にも反映される。重複した queryFn の保守を避ける目的。
export function useOrganizationsQuery() {
  return useQuery<OrganizationListItem[]>({
    queryKey: ["organizations"],
    queryFn: async () => {
      const res = await api.organizations.$get(undefined, authHeaders());
      if (!res.ok) {
        throw new Error(`Failed to fetch organizations: ${res.status}`);
      }
      return await res.json();
    },
  });
}
