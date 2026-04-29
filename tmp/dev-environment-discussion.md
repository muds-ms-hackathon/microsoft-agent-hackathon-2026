# 開発環境・周辺ツール 議論ログ

## Step 1: リポジトリ構成

**Q: monorepo か 複数リポジトリか？**

**議論:**

- 5人チームでサービス間通信がある以上、PR の見通しや Docker Compose の一元管理の方が価値が高い。
- TS + Python 混在の monorepo は若干ぎこちないが、Python 側を独立ディレクトリとして置くだけで JS ツールチェーンと干渉しない。
- 分けるメリットが「TS チームと Python チームが独立して動ける」程度で、通信を考えると薄い。

**結論: monorepo（Turborepo + pnpm workspaces）**

```
/
├── apps/
│   ├── web/        ← Vite + React (TypeScript)
│   └── api/        ← Hono (TypeScript)
├── services/
│   └── ai/         ← FastAPI (Python)
├── docker-compose.yml
└── turbo.json
```

---

## Step 2: パッケージマネージャー（TypeScript）

**Q: pnpm / bun / npm どれか？**

**議論:**

- monorepo との相性が最も良いのは pnpm（workspaces が標準機能・node_modules の重複排除）。
- Turborepo との組み合わせが定番。
- bun は monorepo サポートが発展途上。npm は workspaces 管理がやや貧弱。

**結論: pnpm**

---

## Step 3: ローカル DB 環境

**Q: PostgreSQL をどう立てるか？**

**結論: Docker Compose**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: decision_loop
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    ports:
      - "5432:5432"
```

全員が `docker-compose up -d` で同じ環境を立ち上げられる。Prisma の `DATABASE_URL` を `.env` に書けばすぐ繋がる。

---

## Step 4: Python 環境管理

**Q: uv / Poetry / venv+pip どれか？**

**議論:**

- uv は 2024年以降急速に普及。pip・venv・lock ファイル管理を一括で担い、インストールが爆速。
- `uv sync` 一発で環境が再現できる。Poetry より速く、最近は乗り換えが増えている。

**結論: uv**

`services/ai/` 配下に `pyproject.toml` + `uv.lock` を置く構成。

---

## Step 5: Linter / Formatter

**Q: TS 側・Python 側それぞれ何を使うか？**

**議論:**

- TypeScript: Biome は ESLint + Prettier を1ツールで代替。`biome.json` 1ファイルで完結・高速。初見チームに向いている。
- Python: Ruff は Flake8 + Black + isort を1ツールで代替。uv との相性が良く `pyproject.toml` に数行で済む。

**結論:**

| | ツール |
|---|---|
| TS Lint + Format | Biome |
| Python Lint + Format | Ruff |

---

## Step 6: テスト方針

**Q: どのレイヤーをどこまでテストするか？**

**議論:**

- ハッカソンでも実プロダクトのような品質を目指す方針。
- 社会人 + 大学生の混成チームでテストの重要性・TDD・CI/CD を整えたい。
- AI ツールがあるのでテスト実装コストは下がる。

**結論: C（全レイヤーカバー）**

| レイヤー | ツール | 用途 |
|---|---|---|
| Frontend | Vitest + Testing Library | コンポーネント・ロジック |
| App Server | Vitest | API エンドポイント |
| AI Service | pytest + pytest-asyncio | 構造化ロジック・エンドポイント |

---

## Step 7: CI/CD

**結論: GitHub Actions**

```
PR 作成時:
  lint（Biome / Ruff）
  型チェック（tsc / mypy）
  テスト（Vitest / pytest）

main マージ時:
  上記 + build + Azure へデプロイ
```

**ブランチ戦略:**

- `main`: 常にデプロイ可能
- `feature/*`: 作業ブランチ → PR → レビュー必須 → main マージ

---

## 開発環境・ツールまとめ

| 項目 | 技術 |
|---|---|
| リポジトリ構成 | monorepo（Turborepo + pnpm workspaces） |
| パッケージマネージャー | pnpm |
| ローカル起動 | 全部 Docker Compose（必要に応じてアプリだけネイティブ切り替え） |
| ローカル DB | Docker Compose（PostgreSQL 16） |
| ローカル Service Bus | Docker Compose（Azure Service Bus Emulator） |
| ローカル WebSocket | FastAPI WebSocket サーバー（本番は Azure Web PubSub に切り替え） |
| Python 環境管理 | uv |
| TS Linter/Formatter | Biome |
| Python Linter/Formatter | Ruff |
| ホットリロード | Turborepo `turbo dev`（Vite HMR / tsx watch / uvicorn --reload） |
| 環境変数 | `.env.example`（Git管理）+ `.env.local`（Git管理外） |
| TS テスト | Vitest + Testing Library |
| Python テスト | pytest + pytest-asyncio |
| CI/CD | GitHub Actions |
| ブランチ戦略 | feature/* → PR レビュー → main |
| タスクランナー | Makefile（随時追加） |
