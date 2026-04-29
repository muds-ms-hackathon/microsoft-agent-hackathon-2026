# フロントエンド技術選定 議論ログ

## Step 1: フレームワーク選定

**Q: Next.js か Vite + React (SPA) か？**

- **Next.js**: SSR・SSG・App Router・Server Actions が使える。ただし覚えることが多い。
- **Vite + React (SPA)**: シンプルで軽量。

**議論:**

- このプロダクトは社内向け管理ツールであり SEO 不要。SSR・SSG の恩恵がほぼない。
- 参考: AI Shift 社の事例（Zenn）でも toBツールは Next.js を採用せず Vite + React SPA を選択。サーバーコスト負担とコンテキストスイッチ削減が理由。
- 参考: levtech 記事でも toBツールにはフレームワークなし SPA が合う場面があると言及。
- チームの学習コストを下げる方針と一致する。

**結論: Vite + React (SPA)**

---

## Step 2: ルーティング

**Q: React Router v7 か TanStack Router か？**

- **React Router v7**: 最も普及・情報量が多い。
- **TanStack Router**: 型安全が強力。ファイルベースルーティングも可能。

**議論:**

- AI Shift 社の事例で TanStack Router が採用されており、ルーティングが深くなった場合も追いやすいと評価されている。
- 型安全の恩恵が hono/client との組み合わせで活きる。

**結論: TanStack Router**

---

## Step 3: スタイリング・UI コンポーネント

**Q: MUI（フルコンポーネントライブラリ）か shadcn/ui + Tailwind CSS か plain CSS か？**

**議論:**

- 管理画面寄りのUIのため MUI の DataGrid・フォーム部品の恩恵は受けやすい。
- ただし AI コーディングツール（Cursor・Claude Code）との相性は MUI が低く、shadcn/ui + Tailwind が高い。
- 「AI があるのでコンポーネント実装は苦ではない」→ plain CSS でもよいのでは？という案が出たが、Tailwind は AI が最も得意なスタイリング記法であり、plain CSS より生成精度が高い。shadcn/ui はコードがリポジトリに直接入るため AI が拡張しやすい。
- 「AI で実装する」前提に最も合っているのが shadcn/ui + Tailwind であり、MUI に戻る理由も plain CSS に戻る理由もない。

**結論: shadcn/ui + Tailwind CSS**

---

## Step 4: データフェッチ・状態管理・フォーム

**Q: サーバー状態・クライアント状態・フォームをどう管理するか？**

**結論:**

| 用途 | 技術 | 補足 |
|------|------|------|
| サーバー状態（APIキャッシュ・再取得） | TanStack Query | hono/client と組み合わせて型安全なフェッチ |
| クライアント状態（UI状態など） | Jotai | Zustand より軽量・管理画面規模に十分 |
| フォーム + バリデーション | React Hook Form + Zod | Zod スキーマを App Server と共有できる |

---

## フロントエンド技術スタックまとめ

| レイヤー | 技術 |
|----------|------|
| フレームワーク | Vite + React (TypeScript) |
| ルーティング | TanStack Router |
| UI コンポーネント | shadcn/ui |
| スタイリング | Tailwind CSS |
| サーバー状態管理 | TanStack Query |
| クライアント状態管理 | Jotai |
| フォーム | React Hook Form + Zod |

---

## 次の議論

- テスト方針（Vitest / Testing Library）
- App Server と AI Service の通信方式
