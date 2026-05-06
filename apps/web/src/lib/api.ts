import { hcWithType } from "api/types";
import { getIdToken } from "./auth";

export const api = hcWithType("/api");

export function authHeaders(): { headers: Record<string, string> } {
  const token = getIdToken();
  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}
