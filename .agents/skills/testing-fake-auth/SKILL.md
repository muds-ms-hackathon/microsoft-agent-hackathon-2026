# Testing: fake-auth Service

ローカル開発用OIDCプロバイダー（fake-auth）のテスト手順。

## 起動手順

1. RSA鍵ペアが未生成の場合は先に生成する:
   ```bash
   cd services/fake-auth && pnpm generate-keys
   ```
   - `keys/private.pem` と `keys/public.pem` が生成される
   - `.gitignore` 対象のため、セッションごとに生成が必要な場合がある

2. fake-authサービスを起動:
   ```bash
   cd services/fake-auth && pnpm dev
   ```
   - ポート 3007 で起動（`http://localhost:3007`）
   - Docker経由の場合は `make dev` で全サービスと一緒に起動される

## APIエンドポイント

| メソッド | パス | 用途 |
|---------|------|------|
| GET | `/.well-known/openid-configuration` | OIDC Discovery |
| GET | `/.well-known/jwks.json` | JWKS |
| GET | `/authorize` | ログインフォーム表示 |
| POST | `/authorize` | IDトークン発行＋リダイレクト |
| GET | `/users` | ユーザー一覧取得 |
| POST | `/users` | アカウント作成 |

## テスト方法

API専用サービスのため、curl でテスト可能。ブラウザ録画は不要。

```bash
# ユーザー一覧取得
curl http://localhost:3007/users

# アカウント作成
curl -X POST http://localhost:3007/users \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "name": "test", "displayName": "テスト", "roles": ["member"]}'

# ログイン画面に反映されるか確認
curl http://localhost:3007/authorize?redirect_uri=http://localhost:5173/callback\&state=test\&nonce=test | grep '<option'
```

## バリデーションの検証ポイント

- メール重複: 同じemailで作成 → HTTP 409
- 必須フィールド欠落: emailまたはname なし → HTTP 400
- キー重複: 既存プリセットキー（admin, user, guest）と同名 → HTTP 409

## 注意事項

- インメモリ保存のため、サービス再起動で動的ユーザーはリセットされる
- プリセットユーザー（admin, user, guest）は常に存在する
- ポート 3007 が既に使用中の場合、`fuser -k 3007/tcp` で解放できる
- Lint: `pnpm lint`（Biome）、型チェック: `pnpm typecheck`（tsc）

## Devin Secrets Needed

なし（fake-authはローカル専用で外部認証不要）
