FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY services/ai/pyproject.toml services/ai/uv.lock ./
RUN uv sync
COPY services/ai/main.py ./
COPY services/ai/consumers ./consumers
COPY services/ai/routers ./routers
EXPOSE 8001
CMD ["uv", "run", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8001"]
