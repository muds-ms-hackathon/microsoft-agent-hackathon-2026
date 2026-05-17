import type { Member } from "@/features/organizations/types";
import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

// 組織のメンバー一覧を取得する hook。
// 既存 organizations.$id.tsx に inline で書かれていたパターンを共有化し、
// タスク作成ダイアログの担当者候補としても再利用する。
// クエリキーは "organizations" → ":id" → "members" の階層で、組織 detail と
// invalidate が連動するように合わせている。
export function useOrganizationMembers(orgId: string | null) {
  return useQuery<Member[]>({
    queryKey: ["organizations", orgId, "members"],
    enabled: orgId !== null,
    queryFn: async () => {
      if (!orgId) throw new Error("orgId is required");
      const res = await api.organizations[":id"].members.$get(
        { param: { id: orgId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch organization members: ${res.status}`);
      }
      return (await res.json()) as Member[];
    },
  });
}
