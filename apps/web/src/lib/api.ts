import type { AppType } from "api/types";
import { hc } from "hono/client";
import { getIdToken } from "./auth";

export const api = hc<AppType>("/api");

export function authHeaders(): { headers: Record<string, string> } {
  const token = getIdToken();
  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}
