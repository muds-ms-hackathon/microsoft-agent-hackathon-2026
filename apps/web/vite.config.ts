import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    TanStackRouterVite({ autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      "/api": {
        // Docker 内では API_URL 環境変数でサービス名に切り替える
        target: process.env.API_URL ?? "http://localhost:3001",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/ws": {
        // Docker 内では AI_WS_URL 環境変数でサービス名に切り替える
        target: process.env.AI_WS_URL ?? "ws://localhost:8001",
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
