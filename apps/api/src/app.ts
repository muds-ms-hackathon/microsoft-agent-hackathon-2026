import { Hono } from "hono";
import { healthRoute } from "./routes/health.js";
import { meetingsRoute } from "./routes/meetings.js";
import { organizationsRoute } from "./routes/organizations.js";
import { recurringMeetingsRoute } from "./routes/recurring-meetings.js";

const app = new Hono();

const routes = app
  .route("/health", healthRoute)
  .route("/meetings", meetingsRoute)
  .route("/organizations", organizationsRoute)
  .route("/recurring-meetings", recurringMeetingsRoute);

export { app };
export type AppType = typeof routes;
