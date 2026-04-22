# CLAUDE.md

## プロジェクト概要

定例会議の運用サイクルを支援するAIエージェント。
議事録AIではなく、前回→今回→次回の意思決定・タスク・未決事項の流れを切らさないことが目的。

## リポジトリ構成

```
/
├── apps/
│   ├── web/        # Frontend（Vite + React / TypeScript）
│   └── api/        # App Server（Hono / TypeScript + Prisma）
├── services/
│   └── ai/         # AI Service（FastAPI / Python）
├── docs/           # 要件定義・設計ドキュメント
└── tmp/            # 議論ログ（コミット不要なメモ）
```

## 技術スタック

- Frontend: Vite + React / TanStack Router / shadcn/ui + Tailwind / TanStack Query / Jotai / React Hook Form + Zod
- App Server: Hono (TypeScript) + Prisma + PostgreSQL
- AI Service: FastAPI (Python) + uv
- インフラ: Azure Container Apps / Service Bus / Web PubSub / OpenAI / AI Search

## 開発ルール

- コミット: Conventional Commits 準拠（日本語）
- PR・Issue: `.github/` のテンプレートを使用し必須項目をすべて埋める
- `main` への直接 push 禁止
- コメントは日本語で記載する
