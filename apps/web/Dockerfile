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
RUN pnpm install --frozen-lockfile
COPY apps/web ./apps/web
WORKDIR /app/apps/web
# VITE_* 環境変数はビルド時に静的ファイルへ埋め込まれるため ARG で受け取る
# 注意: VITE_ENTRA_* は issue-177（Entra フロント対応）マージ後に追加する
ARG VITE_FAKE_AUTH_URL
ENV VITE_FAKE_AUTH_URL=$VITE_FAKE_AUTH_URL
RUN pnpm build

# ---- 本番ステージ（GitHub Actions で使用） ----
FROM nginx:alpine AS prod
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
EXPOSE 80
# envsubst で nginx.conf 内の ${API_URL} / ${AI_WS_URL} を環境変数で置換して起動
CMD ["/bin/sh", "-c", "envsubst '${API_URL} ${AI_WS_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
