# ---- 開発ステージ（docker-compose で使用） ----
FROM node:22-alpine AS dev
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm install --frozen-lockfile && pnpm --filter api exec prisma generate
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["pnpm", "dev"]

# ---- ビルドステージ ----
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm install --frozen-lockfile && pnpm --filter api exec prisma generate
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig*.json ./apps/api/
WORKDIR /app/apps/api
RUN pnpm build

# ---- 本番ステージ（GitHub Actions で使用） ----
FROM node:22-alpine AS prod
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
# devDependencies を除外してインストール
RUN pnpm install --frozen-lockfile --prod && pnpm --filter api exec prisma generate
COPY --from=builder /app/apps/api/dist ./apps/api/dist
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
