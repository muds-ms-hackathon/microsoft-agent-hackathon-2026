// hono/client で型安全な API クライアントを生成する際に使用する型
// 使用例（web 側）:
//   import type { ClientType } from "api/types";
import type { hc } from "hono/client";
import type { AppType } from "./app.js";

export type { AppType };

// コンパイル時に型を確定させるトリック（hono 公式推奨パターン）
export type ClientType = ReturnType<typeof hc<AppType>>;
