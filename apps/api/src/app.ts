import { Hono } from "hono";
import { healthRoute } from "./routes/health.js";
import { meetingsRoute } from "./routes/meetings.js";
import { organizationsRoute } from "./routes/organizations.js";
import { recurringMeetingsRoute } from "./routes/recurring-meetings.js";
import { tasksRoute } from "./routes/tasks.js";

const app = new Hono();

const routes = app
  .route("/health", healthRoute)
  .route("/meetings", meetingsRoute)
  .route("/organizations", organizationsRoute)
  .route("/recurring-meetings", recurringMeetingsRoute)
  .route("/tasks", tasksRoute);

export { app };
export type AppType = typeof routes;
