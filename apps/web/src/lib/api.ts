import { hc } from "hono/client";
import type { AppType } from "api/types";

export const api = hc<AppType>("/api");
