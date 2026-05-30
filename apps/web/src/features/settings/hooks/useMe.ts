import { useQuery } from "@tanstack/react-query";
import { api, authHeaders } from "@/lib/api";

// 自分自身のプロフィール。displayName は JWT に含まれないため API から取得する。
export interface MeProfile {
  id: string;
  email: string;
  name: string;
  displayName: string;
}

// 認証ユーザー自身のプロフィールを取得するクエリフック。
export function useMe() {
  return useQuery({
    queryKey: ["me", "profile"],
    queryFn: async () => {
      const res = await api.me.$get(authHeaders());
      if (!res.ok) {
        throw new Error(`Failed to fetch profile: ${res.status}`);
      }
      return (await res.json()) as MeProfile;
    },
  });
}
