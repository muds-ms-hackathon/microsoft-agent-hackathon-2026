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
- APIログイン (`POST /login`)
- トークン検証 (`POST /verify`)
- ユーザー情報取得 (`GET /me`)

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

## APIクライアント用認証フロー

SPAやモバイルアプリなどのAPIクライアント向けに、シンプルなログインAPIを提供している。

```bash
# ログイン（userKeyまたはemailで認証）
curl -X POST http://localhost:3007/login \
  -H "Content-Type: application/json" \
  -d '{"userKey": "admin"}'

# レスポンス
{
  "id_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 86400
}
```

## 開発支援API

### トークン検証

JWTの内容確認や署名検証を行える。トークンのデバッグに使用する。

```bash
# トークン検証
curl -X POST http://localhost:3007/verify \
  -H "Content-Type: application/json" \
  -d '{"id_token": "<your-token>"}'

# レスポンス（成功）
{
  "valid": true,
  "payload": {
    "sub": "1",
    "email": "admin@example.com",
    "email_verified": true,
    "name": "admin",
    "iss": "http://localhost:3007",
    "aud": "fake-auth-client",
    "exp": 1777959344
  },
  "header": {
    "alg": "RS256",
    "kid": "fake-auth-key-1"
  }
}

# レスポンス（失敗）
{
  "valid": false,
  "error": "トークンの検証に失敗しました"
}
```

### ユーザー情報取得

Bearerトークンから現在のユーザー情報を取得する。

```bash
# ユーザー情報取得
curl http://localhost:3007/me \
  -H "Authorization: Bearer <your-token>"

# レスポンス
{
  "key": "admin",
  "id": "1",
  "email": "admin@example.com",
  "emailVerified": true,
  "name": "admin",
  "displayName": "Admin User (管理者)",
  "roles": ["admin"]
}
```

## 独自拡張APIについて

本サービスはOIDC標準エンドポイントに加え、ローカル開発効率向上のための独自APIを提供している。

| エンドポイント | 種別 | 説明 |
|--------------|------|------|
| `/.well-known/openid-configuration` | OIDC標準 | Discovery |
| `/.well-known/jwks.json` | OIDC標準 | JWKS |
| `/authorize` | OIDC準拠 | ブラウザ認証 |
| `/login` | **独自拡張** | API用簡易ログイン |
| `/users` | **独自拡張** | ユーザー管理 |
| `/verify` | **独自拡張** | トークン検証 |
| `/me` | **独自拡張** | ユーザー情報取得 |

実際のEntra ID移行時は、以下の対応が必要となる場合がある：
- `/login` → `/token`（Authorization Code Flow）
- `/me` → `/userinfo`（OIDC標準）

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
