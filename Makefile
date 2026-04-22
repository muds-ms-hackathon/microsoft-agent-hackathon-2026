.PHONY: install dev lint test migrate

install:
	pnpm install
	cd services/ai && uv sync

dev:
	docker compose up -d
	pnpm dev

lint:
	pnpm turbo run lint
	cd services/ai && uv run ruff check .

test:
	pnpm turbo run test
	cd services/ai && uv run pytest

migrate:
	pnpm --filter api prisma migrate dev
