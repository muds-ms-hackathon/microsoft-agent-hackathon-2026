# Decision Loop

定例会議の密度を高めるAIエージェント。会議前準備・内容の構造化・曖昧点レビュー・タスク管理・次回会議への継続を一つのサイクルで支援します。

## Architecture

```mermaid
flowchart LR
    FE["Frontend\nVite + React"]
    API["App Server\nHono / TypeScript"]
    AI["AI Service\nFastAPI / Python"]
    DB[(PostgreSQL)]
    SB[Azure Service Bus]
    WP[Azure Web PubSub]
    OAI[Azure OpenAI]
    AIS[Azure AI Search]

    FE <-->|REST| API
    API --> DB
    API -->|ジョブ投入| SB
    SB -->|Consumer| AI
    AI --> OAI
    AI --> AIS
    AI --> DB
    AI -->|処理完了通知| WP
    WP -->|WebSocket| FE
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.12+
- Docker / Docker Compose

## Getting Started

```bash
# 依存関係のインストール
pnpm install
cd services/ai && uv sync

# ローカル環境の起動（DB・Service Bus エミュレーターを含む）
docker compose up -d

# 全サービスの開発サーバー起動
pnpm dev
```

## Development

```bash
make lint      # Biome (TS) + Ruff (Python)
make test      # Vitest + pytest
make migrate   # prisma migrate dev
```

## Contributing

- `main` への直接 push 禁止。必ず PR を経由する。
- コミット: [Conventional Commits](https://www.conventionalcommits.org/) 準拠（日本語）
- PR・Issue は `.github/` のテンプレートを使用
