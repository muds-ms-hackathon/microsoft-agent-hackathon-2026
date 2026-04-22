.PHONY: install dev lint test format migrate

install:
	pnpm install
	cd services/ai && uv sync

dev:
	docker compose up -d
	overmind start

lint:
	pnpm turbo run lint
	cd services/ai && uv run ruff check .

test:
	pnpm turbo run test
	cd services/ai && uv run pytest || [ $$? -eq 5 ]

format:
	pnpm turbo run format
	cd services/ai && uv run ruff format .

migrate:
	pnpm --filter api prisma migrate dev
