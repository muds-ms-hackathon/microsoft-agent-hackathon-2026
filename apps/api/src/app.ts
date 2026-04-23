import { Hono } from "hono";
import { healthRoute } from "./routes/health.js";
import { meetingsRoute } from "./routes/meetings.js";

const app = new Hono();

app.route("/health", healthRoute);
app.route("/meetings", meetingsRoute);

export { app };
export type AppType = typeof app;
