FROM node:22-slim
WORKDIR /app/services/fake-auth

# pnpmを有効化
RUN corepack enable && corepack prepare pnpm@latest --activate

# 依存関係ファイルをコピーしてインストール（キャッシュ効率化）
COPY services/fake-auth/package.json services/fake-auth/pnpm-lock.yaml* ./
COPY pnpm-workspace.yaml /app/
RUN pnpm install --frozen-lockfile

# ソースコードと鍵をコピー
COPY services/fake-auth/src ./src
COPY services/fake-auth/scripts ./scripts
COPY services/fake-auth/keys ./keys
COPY services/fake-auth/tsconfig.json ./

EXPOSE 3007
CMD ["pnpm", "dev"]
