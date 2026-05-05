import type { AppType } from "api/types";
import { hc } from "hono/client";
import { getIdToken } from "./auth";

type ClientType = ReturnType<typeof hc<AppType>>;
export const api = hc("/api") as unknown as ClientType;

export function authHeaders(): { headers: Record<string, string> } {
  const token = getIdToken();
  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}
