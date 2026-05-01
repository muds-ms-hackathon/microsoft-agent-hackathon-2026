# Fake Auth Service

ローカル開発・CI用のOIDC準拞認証モックサービス。
Entra IDのローカルシミュレータとして動作します。

## 機能

- OIDC Discovery (`/.well-known/openid-configuration`)
- JWKS (`/.well-known/jwks.json`)
- Authorization Endpoint (`/authorize`)
- ID Token発行 (RS256署名)
- アカウント作成 API (`POST /users`)
- ユーザー一覧 API (`GET /users`)

## 開発サーバー起動

```bash
# 初回のみ：鍵ペア生成
pnpm generate-keys

# 開発サーバー起動
pnpm dev
```

## プリセットユーザー

| キー | メール | ロール |
|------|--------|--------|
| admin | admin@example.com | admin |
| user | user@example.com | member |
| guest | guest@example.com | guest |

## 使い方

1. ブラウザで `http://localhost:3007/authorize?redirect_uri=http://localhost:5173/callback&state=xxx&nonce=yyy` にアクセス
2. ユーザーを選択してログイン
3. `redirect_uri#id_token=xxx&state=xxx` にリダイレクト

## アカウント作成 API

`POST /users` でユーザーを動的に作成できます。作成したユーザーはログイン画面の選択肢に追加されます。

```bash
# アカウント作成
curl -X POST http://localhost:3007/users \
  -H "Content-Type: application/json" \
  -d '{"email": "taro@example.com", "name": "taro", "displayName": "太郎", "roles": ["member"]}'

# ユーザー一覧取得
curl http://localhost:3007/users
```

| フィールド | 必須 | デフォルト | 説明 |
|-----------|------|-----------|------|
| email | o | - | メールアドレス（重複不可） |
| name | o | - | ユーザー名（キーとしても使用） |
| displayName | - | name と同値 | 表示名 |
| roles | - | `["member"]` | ロール配列 |

## APIとの連携

API側で以下の環境変数を設定：

```env
# FakeAuthモード
OIDC_ISSUER=http://localhost:3007
OIDC_JWKS_URI=http://localhost:3007/.well-known/jwks.json
```

## 注意事項

- 本サービスは**ローカル開発・CI専用**
- `keys/*.pem` は.gitignore対象（開発用固定鍵）
- 本番環境では絶対に使用しない
