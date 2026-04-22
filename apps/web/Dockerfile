FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["pnpm", "dev", "--host"]
