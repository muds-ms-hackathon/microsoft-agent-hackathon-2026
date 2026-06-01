import { hcWithType } from "api/types";
import { getIdToken } from "./auth";

// 本番: VITE_API_URL=https://decision-loop-api.azurewebsites.net を参照する。
// 未設定時（ローカル開発）は "/api" にフォールバックし、vite.config.ts の
// dev server proxy が /api -> localhost:3001 に転送する。
const rawApiBaseUrl =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

export const api = hcWithType(apiBaseUrl);

export function authHeaders(): { headers: Record<string, string> } {
  const token = getIdToken();
  return {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
}
