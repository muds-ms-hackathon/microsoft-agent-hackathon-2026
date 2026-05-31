# ---- 開発ステージ（docker-compose で使用） ----
FROM python:3.12-slim AS dev
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY services/ai/pyproject.toml services/ai/uv.lock ./
RUN uv sync
COPY services/ai/main.py ./
COPY services/ai/consumers ./consumers
COPY services/ai/routers ./routers
EXPOSE 8001
CMD ["uv", "run", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8001"]

# ---- 本番ステージ（GitHub Actions で使用） ----
FROM python:3.12-slim AS prod
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY services/ai/pyproject.toml services/ai/uv.lock ./
# dev 依存関係を除外してインストール
RUN uv sync --no-dev
COPY services/ai/main.py ./
COPY services/ai/consumers ./consumers
COPY services/ai/routers ./routers
EXPOSE 8001
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
