import { Hono } from "hono";
import { healthRoute } from "./routes/health.js";
import { meetingsRoute } from "./routes/meetings.js";

const app = new Hono();

const routes = app
  .route("/health", healthRoute)
  .route("/meetings", meetingsRoute);

export { app };
export type AppType = typeof routes;
