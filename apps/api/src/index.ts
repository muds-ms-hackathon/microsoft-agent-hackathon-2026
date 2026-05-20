import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { closeServiceBus } from "./lib/service-bus.js";

const port = Number(process.env.PORT) || 3001;

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`サーバー起動: http://localhost:${port}`);
});

const shutdown = async (signal: string) => {
  console.log(`[${signal}] シャットダウン開始`);
  await closeServiceBus();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
