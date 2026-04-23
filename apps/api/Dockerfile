FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
RUN pnpm install --frozen-lockfile && pnpm --filter api exec prisma generate
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["pnpm", "dev"]
