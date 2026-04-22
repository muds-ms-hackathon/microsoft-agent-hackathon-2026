import { Hono } from "hono";
import { healthRoute } from "./routes/health.js";

const app = new Hono();

app.route("/health", healthRoute);

export { app };
export type AppType = typeof app;
