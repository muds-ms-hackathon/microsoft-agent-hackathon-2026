FROM python:3.12-slim
RUN pip install uv
WORKDIR /app
COPY services/ai/pyproject.toml services/ai/uv.lock ./
RUN uv sync
EXPOSE 8001
CMD ["uv", "run", "uvicorn", "main:app", "--reload", "--host", "0.0.0.0", "--port", "8001"]
