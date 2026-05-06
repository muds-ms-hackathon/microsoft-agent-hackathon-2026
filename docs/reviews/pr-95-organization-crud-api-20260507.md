# Code Review: PR #95 — `feat(api): 組織 CRUD・メンバー招待 API を追加`

- 対象: <https://github.com/muds-ms-hackathon/microsoft-agent-hackathon-2026/pull/95>
- ブランチ: `feature/issue-85-organization-crud-api`
- 変更規模: +1036 / -1（routes・migration・vitest 追加）
- レビュー日: 2026-05-07

---

## 1. 概要

組織エンティティの CRUD と「招待 → 参加」フローを `apps/api/src/routes/organizations.ts` に新設する PR。

- `POST/GET/GET:id/PATCH/DELETE /organizations` の 5 エンドポイント
- `POST /organizations/:id/invite`・`POST /organizations/:id/join` の招待・参加フロー
- 重複していた所属＋ロール判定を `requireRole` ヘルパーに集約
- Prisma スキーマに `OrganizationInvitation.role` を追加（マイグレーション同梱）
- Prisma を全モックした vitest 31 ケース。`organizations.ts` を 100% カバレッジ

設計上のトレードオフ（未所属者へは 404 で存在を露出させない、`$transaction` で組織作成と owner 登録を原子化、招待重複は `P2002` を 409 にマッピング、参加レースは外側の高速チェック＋内側 P2002 二段構え）は PR 説明とコードコメントに明記されており、意図が追いやすい。

総評: **方針・実装ともに堅実で、致命的な不具合は見当たらない**。ただし下記 §3.1 のメール照合の casing バグだけは production 投入前に塞いでおきたい。

---

## 2. 変更ファイル一覧

| ファイル | 変更 |
| --- | --- |
| `apps/api/prisma/schema.prisma` | `OrganizationInvitation` に `role OrgRole @default(member)` を追加 |
| `apps/api/prisma/migrations/20260507100000_add_invitation_role/migration.sql` | 上記カラム追加マイグレーション |
| `apps/api/src/app.ts` | `organizationsRoute` をマウント |
| `apps/api/src/routes/organizations.ts` | 新規 251 行 |
| `apps/api/test/organizations.test.ts` | 新規 778 行・31 ケース |

---

## 3. 主な指摘

### 3.1 [Must] `/join` のメール照合が大文字小文字を区別する — 招待が見つからないバグの可能性

`apps/api/src/routes/organizations.ts:267`

```ts
const invitation = await tx.organizationInvitation.findFirst({
  where: {
    organizationId: id,
    email: user.email,                 // ← raw のまま
    status: "pending",
    expiresAt: { gt: new Date() },
  },
});
```

一方、招待作成側 (`apps/api/src/routes/organizations.ts:85`) は Zod で `z.string().trim().toLowerCase().email()` しているため、DB には常に **小文字化された email** が保存される。

`apps/api/src/middleware/auth.ts:38-57` の `auth` ミドルウェアは IdP (`payload.email`) をそのまま `User.email` に upsert しており、casing を正規化していない。FakeAuth ではたまたま小文字で揃うかもしれないが、Entra ID 等では大文字を含む UPN/メールが返るケースがある（例: `Bob@Example.com`）。その場合：

1. `POST /organizations/:id/invite` は `bob@example.com` で保存
2. Bob がログインし `user.email = "Bob@Example.com"` のまま `/join` を叩く
3. `findFirst` が一致せず 404「有効な招待が見つかりません」

招待を出したのに永久に参加できない、という UX 上クリティカルな不整合になる。

**推奨修正（最小）**: `/join` の照合だけ正規化する。

```ts
email: user.email.trim().toLowerCase(),
```

**推奨修正（恒久）**: `auth.ts` の upsert で email を `email.trim().toLowerCase()` に統一する（こちらだと User.email も一意性 (case-insensitive) を保てる）。後者の場合は別 PR 切り出しでも可。

合わせて、`organizations.test.ts` に「`user.email` に大文字混入があっても招待をマッチできる」ケースを 1 つ追加しておくとリグレッション防止になる。

---

### 3.2 [Should] `requireRole(c, id, null, "")` のシグネチャは少し不格好

`apps/api/src/routes/organizations.ts:93-121`, `158`

`GET /:id` だけ「ロールは何でもよい」ため `allowed=null`, `forbiddenMessage=""` を渡している。`forbiddenMessage` が空文字でも `allowed=null` の場合は到達しない実装になっているので問題はないが、呼び出し側に「null のときは第4引数が無意味」という暗黙知が必要になっている。

**選択肢**:

- (a) オプション引数を `{ allowed?: OrgRole[]; forbiddenMessage?: string }` のオブジェクトにする
- (b) 「所属確認のみ」の薄い別関数 `requireMembership(c, id)` を切り出す

ヘルパーのために 1 段抽象を増やすほどではないので、(b) のほうが軽量で意図も伝わる。

---

### 3.3 [Should] `description: ""` を許容するセマンティクスを明示しておく

`apps/api/src/routes/organizations.ts:72-80`

`updateSchema` は `description: z.string().optional()` のため、空文字列が通る。これは「説明を空に上書きする」操作として扱いたいのか、それとも「未指定と同義（無視）」として扱いたいのかでハンドラの意味が変わる。

現状は `data` をそのまま `prisma.organization.update` に渡しているため、`description: ""` を送ると DB 上は空文字に更新される一方、`null` には戻せない（Zod が拒否する）。

仕様として「クリアは空文字」なら問題なし、「null でクリアしたい」なら `z.string().nullable().optional()` ＋ 動作を test に追加。どちらの意図か明示しておきたい。

---

### 3.4 [Nit] `DELETE /:id` のレスポンス

`apps/api/src/routes/organizations.ts:193-194`

削除した Organization 行を 200 で返している。Cascade で `Membership / Invitation / RecurringMeeting / MeetingMember` も消える前提の操作で、消えた本体だけ返すのはやや中途半端。`204 No Content` か、最低でも「削除済みであること」を示すペイロード（例 `{ deleted: true, id }`）の方が API 利用側のコードが書きやすい。ブロッカーではない。

---

### 3.5 [Nit] 招待時に「招待先がすでにメンバー」のチェックがない

`apps/api/src/routes/organizations.ts:196-236`

招待先 email が既に `OrganizationMembership` に存在しても、`organizationInvitation.create` は通る。受信者は `/join` で 409 が返って参加できないだけで、`pending` の招待行が無駄に蓄積する。

スコープ外と割り切って良いが、追加するなら `tx.organizationMembership.findFirst({ where: { organizationId: id, user: { email } } })` のチェックを 1 回挟めば済む。`tmp/` あたりに後続 issue として残すかコメントで NOTE にしておきたい。

---

### 3.6 [Nit] テストが Prisma を全モック → スキーマ変更時の追従漏れリスク

`apps/api/test/organizations.test.ts:312-333`

ルートロジックの単体テストとしては正しい設計だが、`OrganizationInvitation` に今回 `role` カラムを足したように、スキーマが拡張されてもモックは黙って通る。最低限、`make test` の上位（例えば既存の `apps/api` integration テストや `make migrate && pnpm prisma generate` を CI で走らせる）でスキーマ⇄ハンドラの整合は取れているか確認したい。今 PR の手元では `make lint` / `make test` で GREEN になることが PR 説明に明記されているので OK。後続で 1 本だけでも実 DB を叩く e2e があると安心。

---

## 4. その他チェック項目

### 4.1 セキュリティ

- 認証は全ルート `auth` ミドルウェアで強制。OK
- 未所属者には 404 で組織の存在を露出させない方針が一貫している。OK
- `inviteSchema` で `role: z.enum(["admin", "member"])` として `owner` 招待を防いでいる。OK
- `expiresInDays` は `z.number().int().positive().max(365)` で範囲制限。OK
- SQL Injection: Prisma のパラメータ化 API のみ使用。OK
- マスアサインメント: `PATCH` は `updateSchema` を `.strict()` で固定し、想定外フィールドを弾いている。OK
- `requireRole` は `userId × organizationId` の複合主キーで検索しているため、他組織のロールを誤参照する余地はない。OK

### 4.2 パフォーマンス

- `GET /organizations`: `memberships.some` のサブクエリ + `createdAt` ソート。`OrganizationMembership` には `@@index([organizationId])` があるが `userId` 単独 index は無い（複合主キー先頭が `userId` なので実質カバーされる）。問題なし。
- `GET /:id`: membership と organization で 2 クエリ。許容範囲。
- `/join`: 外側の `findUnique` → 内側で `$transaction(findFirst→update→create)` の合計 4 RTT。トランザクション内で完結しており直列性は維持できているが、招待数が増えた場合 `findFirst` は `@@index([email])` にヒットして OK。

### 4.3 マイグレーション安全性

`20260507100000_add_invitation_role/migration.sql:1-2`

```sql
ALTER TABLE "OrganizationInvitation" ADD COLUMN "role" "OrgRole" NOT NULL DEFAULT 'member';
```

`NOT NULL` だが `DEFAULT 'member'` 付きなので既存行は `member` が補完される。これは破壊的ではなく、ロールバックも `DROP COLUMN` で素直。OK。

### 4.4 規約準拠

- Conventional Commits（日本語）: コミット履歴上 OK
- PR テンプレ準拠: 関連 Issue / 概要 / 背景 / 変更内容 / 動作確認手順を埋めている。OK
- コメント日本語: OK
- AI 痕跡: 見当たらず。OK

---

## 5. まとめ

| 区分 | 件数 | 内訳 |
| --- | --- | --- |
| Must | 1 | §3.1 `/join` の email 大文字小文字バグ |
| Should | 2 | §3.2 `requireRole` API、§3.3 `description: ""` セマンティクス明示 |
| Nit | 3 | §3.4 DELETE 戻り値、§3.5 招待時メンバー重複、§3.6 e2e |

§3.1 だけ修正（または `auth.ts` の email 正規化への切り出し PR）を入れた上でマージする方針を推奨。それ以外はマージ後の追従でも実害なし。
