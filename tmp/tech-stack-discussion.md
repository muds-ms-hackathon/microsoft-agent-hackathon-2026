# 技術選定 議論ログ

## Step 1: フロントエンド

**結論: Vite + React (TypeScript)**

詳細は `frontend-stack-discussion.md` を参照。

---

## Step 2: バックエンド言語の選定

**Q: TypeScript か Python か？**

- 候補A: TypeScript（フルスタック統一）
- 候補B: Python（AI処理に強い）

**議論:**

- このプロダクトの中心は AI処理（構造化・曖昧性抽出・アジェンダ生成）なので、LangChain / Semantic Kernel / Azure AI SDK のエコシステムが成熟している Python に優位性がある。
- ただしバックエンドを「App Server（CRUD・DB接続）」と「AI Service（AI処理）」に分離する場合、App Server 側は普通の Web バックエンドになるため Python の優位性が薄れる。

---

## Step 3: サービス分割の判断

**Q: App Server と AI Service を分けるか？**

**分けた場合の構成:**

```
Frontend (Next.js / TypeScript)
     ↓
App Server (TypeScript / Hono or Fastify)
  - Meeting / Task / Decision / OpenIssue の CRUD
  - DB接続 (Prisma + Cosmos DB or PostgreSQL)
  - フロントと型定義・Zodスキーマを共有できる

AI Service (Python / FastAPI)
  - 構造化・曖昧性抽出・アジェンダ生成
  - Azure OpenAI / AI Search / RAG
```

**分けない場合の構成:**

```
Frontend (Next.js / TypeScript)
     ↓
Backend (Python / FastAPI)
  - CRUD + AI処理を同一プロセスで管理
  - LangChain / Semantic Kernel 直接利用
  - Azure SDK for Python
```

**議論:**

- 分ける場合: App Server は TypeScript が自然（Prisma の型安全 ORM・Zod の型共有が活きる）。AI Service は Python 一択。ただし 2 サービスの運用・デプロイ・サービス間通信のコストが増える。
- 分けない場合: Python 1 本で完結。AI 処理と CRUD を同一プロセスで扱えるためシンプル。MVP フェーズには現実的。

**結論: 分ける（TypeScript + Python の 2 サービス構成）**

理由:
- App Server 側の型安全性（Prisma・Zod）と、フロントとの型共有の恩恵が大きい。
- AI Service は Python でないと中長期で辛くなる（RAG パイプライン・エコシステムの成熟度）。
- ハッカソンスコープでも 2 サービス構成は許容範囲と判断。

---

## Step 4: DB の選定

**Q: RDB（PostgreSQL）か NoSQL（Cosmos DB）か？**

**議論:**

- 設計見直し前提なら NoSQL でも成立する。ただし横断クエリ（全シリーズのタスク一覧・未解消 OpenIssue 一覧）が多いこのプロダクトの性質上、NoSQL では cross-partition query が重くなりやすい。
- コスト面は $200 の予算があれば DB の差額は誤差レベル。Azure OpenAI の呼び出し回数の方が支配的。
- スキーマがまだ流動的なため、`prisma migrate dev` 一発で変更を追える Prisma + PostgreSQL の開発速度が決め手。

**結論: PostgreSQL + Prisma**

理由:
- 横断クエリが多いアクセスパターンに自然に対応できる。
- スキーマ変更が多い今の段階で Prisma のマイグレーション管理が効く。
- Cosmos DB のパーティションキー設計を後から直すコストをハッカソン中に払いたくない。

---

## Step 5: App Server ↔ AI Service 通信方式

**Q: REST（同期）か メッセージキュー（非同期）か？**

**議論:**

- 当初 REST + ポーリングを提案したが、LLM 呼び出しは秒数が読めないため REST 同期は実プロダクトとして設計が弱い。
- ポーリングは「REST の限界を誤魔化す」設計であり、本質的な解決にならない。
- AI 処理が絡む実プロダクトでは非同期キューが標準的。
- Azure のサービスを上手く活用できるかも選定の軸。

**結論: Azure Service Bus + Azure Web PubSub（非同期）**

```
App Server ──→ Azure Service Bus ──→ AI Service（Consumer）
                                           ↓
                                       DB に結果保存
                                           ↓
                              Azure Web PubSub でフロントに通知
```

| サービス | 役割 |
|---|---|
| Azure Service Bus | ジョブキュー。リトライ・デッドレターキューが標準装備 |
| Azure Container Apps + KEDA | Service Bus のキュー深度に応じて AI Service を自動スケール |
| Azure Web PubSub | AI 処理完了をフロントにリアルタイム通知 |

理由:
- AI Service が落ちてもジョブはキューに残り、復帰後に処理される
- 負荷に応じて AI Service だけスケールアウトできる
- Azure の強みをそのまま活かせる構成

---

## 技術スタックまとめ

| レイヤー | 技術 | 補足 |
|----------|------|------|
| Frontend | Vite + React (TypeScript) | TanStack Router / shadcn/ui / Tailwind / TanStack Query / Jotai / RHF+Zod |
| App Server | Hono (TypeScript) | Prisma ORM・Zod スキーマ共有・hono/client で型共有 |
| AI Service | FastAPI (Python) | LangChain or Semantic Kernel |
| 通信 | Azure Service Bus | App Server → AI Service のジョブキュー |
| 通知 | Azure Web PubSub | AI 処理完了のリアルタイム通知 |
| スケーリング | Azure Container Apps + KEDA | Service Bus キュー深度に応じた自動スケール |
| AI 基盤 | Azure OpenAI / Microsoft Foundry | §16.2 |
| 検索 | Azure AI Search | RAG による文脈補完 §16.3 |
| DB | PostgreSQL + Prisma | Azure Database for PostgreSQL |
| 実行基盤 | Azure Container Apps | §16.1 |

---

## 次の議論

- Semantic Kernel vs LangChain の選定
