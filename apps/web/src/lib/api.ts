import { hcWithType } from "api/types";
import { resolveApiBaseUrl } from "./env";
import { getIdToken } from "./auth";

export const api = hcWithType(resolveApiBaseUrl(import.meta.env.VITE_API_URL));

export function authHeaders(): { headers: Record<string, string> } {
  const token = getIdToken();
  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}
