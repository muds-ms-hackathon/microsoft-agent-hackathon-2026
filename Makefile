.PHONY: help install dev dev-build dev-fresh dev-reset dev-native fake-auth-keys docker-clean lint test format migrate migrate-status db-shell refresh

help: ## 利用可能な make ターゲット一覧を表示する
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## pnpm install と uv sync で依存関係をインストールする
	pnpm install
	cd services/ai && uv sync

dev: ## 全サービスを Docker Compose で起動する（イメージ再ビルドなし）
	docker compose up

dev-build: ## イメージを再ビルドしてから起動する（package.json / Dockerfile 変更後）
	docker compose up --build

dev-fresh: ## node_modules の anonymous volume のみリセットして起動する（DB データは維持）
	docker compose up --build --renew-anon-volumes

dev-reset: ## 全 volume（DB 含む）をリセットして起動する（起動後に make migrate が必要）
	docker compose down -v
	docker compose up --build

docker-clean: ## コンテナと全 volume を削除する（起動はしない）
	docker compose down -v --remove-orphans

refresh: ## 単一サービスを anon volume ごと再生成する（SVC=<service> を指定）
	@if [ -z "$(SVC)" ]; then \
		echo "Usage: make refresh SVC=<service>" >&2; \
		echo "  例: make refresh SVC=web" >&2; \
		exit 1; \
	fi
	docker compose rm -fsv $(SVC)
	docker compose up -d --build $(SVC)

dev-native: ## インフラ（db / servicebus / fake-auth）のみ Docker で起動し、アプリは overmind で起動する
	docker compose up -d db servicebus-db servicebus fake-auth
	overmind start

fake-auth-keys: ## fake-auth の RSA 鍵ペアを生成する（初回のみ）
	cd services/fake-auth && pnpm install && pnpm generate-keys

lint: ## Biome (TS) + Ruff (Python) で lint を実行する
	pnpm turbo run lint
	cd services/ai && uv run ruff check .

test: ## Vitest + pytest を実行する
	pnpm turbo run test
	cd services/ai && uv run pytest || [ $$? -eq 5 ]

format: ## Biome + Ruff の自動修正を実行する
	pnpm turbo run format
	cd services/ai && uv run ruff format .

migrate: ## prisma migrate dev を実行する（NAME=xxx でマイグレーション名指定可）
	@if [ -f apps/api/.env ]; then set -a; . apps/api/.env; set +a; fi; pnpm --filter api exec prisma migrate dev --name $(if $(NAME),$(NAME),migration)

migrate-status: ## マイグレーションの適用状況を確認する
	@if [ -f apps/api/.env ]; then set -a; . apps/api/.env; set +a; fi; pnpm --filter api exec prisma migrate status

db-shell: ## psql で decision_loop DB に直接接続する
	@if [ -f apps/api/.env ]; then set -a; . apps/api/.env; set +a; fi; \
	  psql "$${DATABASE_URL}"
