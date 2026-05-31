# ---- 開発ステージ（docker-compose で使用） ----
FROM node:22-alpine AS dev
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

# ---- ビルドステージ ----
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY apps/api/src ./apps/api/src
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts ./apps/api/
RUN pnpm install --frozen-lockfile
# web が api の型（@prisma/client）を参照するため事前に生成する
RUN pnpm --filter api exec prisma generate --generator client
COPY apps/web ./apps/web
WORKDIR /app/apps/web
# VITE_* 環境変数はビルド時に静的ファイルへ埋め込まれるため ARG で受け取る
ARG VITE_AUTH_PROVIDER
ARG VITE_ENTRA_CLIENT_ID
ARG VITE_ENTRA_AUTHORITY
ARG VITE_ENTRA_REDIRECT_URI
ARG VITE_ENTRA_TENANT_ID
ENV VITE_AUTH_PROVIDER=$VITE_AUTH_PROVIDER
ENV VITE_ENTRA_CLIENT_ID=$VITE_ENTRA_CLIENT_ID
ENV VITE_ENTRA_AUTHORITY=$VITE_ENTRA_AUTHORITY
ENV VITE_ENTRA_REDIRECT_URI=$VITE_ENTRA_REDIRECT_URI
ENV VITE_ENTRA_TENANT_ID=$VITE_ENTRA_TENANT_ID
RUN pnpm build

# ---- 本番ステージ（GitHub Actions で使用） ----
FROM nginx:alpine AS prod
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
# envsubst で nginx.conf 内の ${API_URL} / ${AI_WS_URL} を環境変数で置換して起動
CMD ["/bin/sh", "-c", "envsubst '${API_URL} ${AI_WS_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
