FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
# api ワークスペースを devDependency で参照しているため、apps/api/src/types.ts の
# 内部 import（hono/client など）を Vite が解決できるよう、apps/api 側の
# node_modules もインストール対象に含める
COPY apps/api/package.json ./apps/api/
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["pnpm", "dev", "--host"]
