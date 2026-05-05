// hono/client で型安全な API クライアントを生成する際に使用する型
// 使用例（web 側）:
//   import { hcWithType } from "api/types";
//   const client = hcWithType("http://localhost:3001");
import { hc } from "hono/client";
import type { AppType } from "./app.js";

export type { AppType };

// コンパイル時に型を確定させるトリック（hono 公式推奨パターン）
export type ClientType = ReturnType<typeof hc<AppType>>;
export const hcWithType = (...args: Parameters<typeof hc>): ClientType =>
  hc<AppType>(...args);
