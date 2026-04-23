.PHONY: install dev dev-build dev-fresh dev-reset dev-native docker-clean lint test format migrate migrate-status db-shell

install:
	pnpm install
	cd services/ai && uv sync

# 全サービスを Docker Compose で起動する（イメージ再ビルドなし）
dev:
	docker compose up

# イメージを再ビルドしてから起動する（package.json / Dockerfile 変更後）
dev-build:
	docker compose up --build

# node_modules の anonymous volume のみリセットして起動する（DB データは維持）
dev-fresh:
	docker compose up --build --renew-anon-volumes

# 全 volume（DB 含む）をリセットして起動する（起動後に make migrate が必要）
dev-reset:
	docker compose down -v
	docker compose up --build

# コンテナと全 volume を削除する
docker-clean:
	docker compose down -v --remove-orphans

# インフラ（db / servicebus）のみ Docker で起動し、アプリは overmind（Procfile）で起動する
dev-native:
	docker compose up -d db servicebus-db servicebus
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
	@if [ -f apps/api/.env ]; then set -a; . apps/api/.env; set +a; fi; pnpm --filter api exec prisma migrate dev --name $(if $(NAME),$(NAME),migration)

# マイグレーションの適用状況を確認する
migrate-status:
	@if [ -f apps/api/.env ]; then set -a; . apps/api/.env; set +a; fi; pnpm --filter api exec prisma migrate status

# psql でDBに直接接続する
db-shell:
	@if [ -f apps/api/.env ]; then set -a; . apps/api/.env; set +a; fi; \
	  psql "$${DATABASE_URL}"
