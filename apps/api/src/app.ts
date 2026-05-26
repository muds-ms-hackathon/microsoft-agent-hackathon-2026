import { Hono } from "hono";
import { cors } from "hono/cors";
import { ambiguousInfosRoute } from "./routes/ambiguous-infos.js";
import { decisionItemsRoute } from "./routes/decision-items.js";
import { healthRoute } from "./routes/health.js";
import { internalRoute } from "./routes/internal.js";
import { meRoute } from "./routes/me.js";
import { meetingsRoute } from "./routes/meetings.js";
import { organizationsRoute } from "./routes/organizations.js";
import { recurringMeetingsRoute } from "./routes/recurring-meetings.js";
import { tasksRoute } from "./routes/tasks.js";
import { internalAuth } from "./middleware/internal-auth.js";

const app = new Hono();

// CORS: 本番は web と api が別ホスト想定のため、ALLOWED_ORIGINS で許可オリジンを指定する。
// 未設定時は暫定で全許可（dev / 初回デプロイ用）。本番環境では必ず設定すること。
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
const allowedOrigins = allowedOriginsEnv
  ? allowedOriginsEnv
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o.length > 0)
  : null;

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!allowedOrigins) {
        return "*";
      }
      return allowedOrigins.includes(origin) ? origin : null;
    },
    credentials: false,
  }),
);

// 未捕捉例外を構造化レスポンスに変換する。内部実装に依存した文字列の露出を防ぐ。
app.onError((err, c) => {
  console.error("[app.onError] 未捕捉例外:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// 未定義パスを JSON 404 に統一する。
app.notFound((c) => c.json({ error: "Not Found" }, 404));

// /internal/* にのみ認証ミドルウェアを適用する
app.use("/internal/*", internalAuth);

const routes = app
  .route("/health", healthRoute)
  .route("/me", meRoute)
  .route("/meetings", meetingsRoute)
  .route("/organizations", organizationsRoute)
  .route("/recurring-meetings", recurringMeetingsRoute)
  .route("/tasks", tasksRoute)
  .route("/decision-items", decisionItemsRoute)
  .route("/ambiguous-infos", ambiguousInfosRoute)
  .route("/internal", internalRoute);

export { app };
export type AppType = typeof routes;
