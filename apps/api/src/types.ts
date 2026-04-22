// hono/client で型安全な API クライアントを生成する際に使用する型
// 使用例（web 側）:
//   import { hc } from "hono/client";
//   import type { AppType } from "api/src/types";
//   const client = hc<AppType>("http://localhost:3001");
export type { AppType } from "./app.js";
