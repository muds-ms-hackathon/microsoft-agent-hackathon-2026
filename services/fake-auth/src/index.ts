import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  SignJWT,
  exportJWK,
  importJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
} from "jose";
import {
  type FakeUser,
  createUser,
  getAllUsers,
  getUserByEmail,
  getUserByKey,
  users,
} from "./users.js";

const app = new Hono();

const keysDir = join(import.meta.dirname, "..", "keys");
const privateKeyPem = readFileSync(join(keysDir, "private.pem"), "utf-8");
const publicKeyPem = readFileSync(join(keysDir, "public.pem"), "utf-8");

const KEY_ID = "fake-auth-key-1";
const ISSUER = process.env.ISSUER ?? "http://localhost:3007";

async function getPrivateKey() {
  return await importPKCS8(privateKeyPem, "RS256");
}

async function getPublicJWK() {
  const publicKey = await importSPKI(publicKeyPem, "RS256");
  const jwk = await exportJWK(publicKey);
  return {
    ...jwk,
    kid: KEY_ID,
    use: "sig",
    alg: "RS256",
    kty: "RSA",
  };
}

async function generateIdToken(user: FakeUser, nonce: string): Promise<string> {
  const privateKey = await getPrivateKey();

  return await new SignJWT({
    sub: user.id,
    email: user.email,
    email_verified: user.emailVerified,
    name: user.name,
    nonce: nonce,
  })
    .setProtectedHeader({ alg: "RS256", kid: KEY_ID })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience("fake-auth-client")
    .setExpirationTime("24h")
    .sign(privateKey);
}

// OIDC Discovery
app.get("/.well-known/openid-configuration", (c) => {
  return c.json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    response_types_supported: ["id_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
  });
});

// JWKS
app.get("/.well-known/jwks.json", async (c) => {
  const jwk = await getPublicJWK();
  return c.json({ keys: [jwk] });
});

// Authorize - GET (login form)
app.get("/authorize", (c) => {
  const redirectUri = c.req.query("redirect_uri");
  const state = c.req.query("state") ?? "";
  const nonce = c.req.query("nonce") ?? "";

  if (!redirectUri) {
    return c.text("redirect_uri is required", 400);
  }

  const usersList = getAllUsers()
    .map(
      ([key, user]) =>
        `<option value="${key}">${user.displayName} (${user.email})</option>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Fake Auth - Login</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 400px;
      margin: 50px auto;
      padding: 20px;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    select, button {
      width: 100%;
      padding: 10px;
      margin: 10px 0;
      font-size: 1rem;
    }
    button {
      background: #0066cc;
      color: white;
      border: none;
      cursor: pointer;
    }
    button:hover {
      background: #0055aa;
    }
  </style>
</head>
<body>
  <h1>Fake Auth - ログインユーザーを選択</h1>
  <form method="post" action="/authorize">
    <input type="hidden" name="redirect_uri" value="${redirectUri}">
    <input type="hidden" name="state" value="${state}">
    <input type="hidden" name="nonce" value="${nonce}">
    <select name="user" required>
      <option value="">-- ユーザーを選択 --</option>
      ${usersList}
    </select>
    <button type="submit">ログイン</button>
  </form>
</body>
</html>`;

  return c.html(html);
});

// Authorize - POST (generate ID token and redirect)
app.post("/authorize", async (c) => {
  const body = await c.req.formData();
  const redirectUri = body.get("redirect_uri") as string;
  const state = (body.get("state") as string) ?? "";
  const nonce = (body.get("nonce") as string) ?? "";
  const userKey = body.get("user") as string;

  if (!redirectUri || !userKey) {
    return c.text("redirect_uri and user are required", 400);
  }

  const user = getUserByKey(userKey);
  if (!user) {
    return c.text("Invalid user", 400);
  }

  const idToken = await generateIdToken(user, nonce);

  // Redirect with fragment (implicit flow style)
  const redirectUrl = new URL(redirectUri);
  const hash = new URLSearchParams();
  hash.set("id_token", idToken);
  if (state) hash.set("state", state);
  redirectUrl.hash = hash.toString();

  return c.redirect(redirectUrl.toString());
});

// ユーザー一覧
app.get("/users", (c) => {
  const usersList = getAllUsers().map(([key, user]) => ({ key, ...user }));
  return c.json(usersList);
});

// ログイン（API用）
app.post("/login", async (c) => {
  const body = await c.req.json<{
    userKey?: string;
    email?: string;
  }>();

  if (!body.userKey && !body.email) {
    return c.json({ error: "userKey または email が必要です" }, 400);
  }

  const user = body.userKey
    ? getUserByKey(body.userKey)
    : getUserByEmail(body.email ?? "");

  if (!user) {
    return c.json({ error: "ユーザーが見つかりません" }, 404);
  }

  const idToken = await generateIdToken(user, "");

  return c.json({
    id_token: idToken,
    expires_in: 86400, // 24時間（秒）
  });
});

// トークン検証（開発支援用）
app.post("/verify", async (c) => {
  const body = await c.req.json<{ id_token?: string }>();

  if (!body.id_token) {
    return c.json({ valid: false, error: "id_token が必要です" }, 400);
  }

  try {
    const jwk = await getPublicJWK();
    const { payload, protectedHeader } = await jwtVerify(
      body.id_token,
      await importJWK(jwk, "RS256"),
      {
        issuer: ISSUER,
        audience: "fake-auth-client",
      },
    );

    return c.json({
      valid: true,
      payload,
      header: protectedHeader,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "トークン検証に失敗しました";
    return c.json({ valid: false, error: message }, 401);
  }
});

// 現在のユーザー情報取得（開発支援用）
app.get("/me", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json(
      { error: "Authorization: Bearer <token> ヘッダーが必要です" },
      401,
    );
  }

  const token = authHeader.slice(7);

  try {
    const jwk = await getPublicJWK();
    const { payload } = await jwtVerify(token, await importJWK(jwk, "RS256"), {
      issuer: ISSUER,
      audience: "fake-auth-client",
    });

    const userId = payload.sub;
    if (!userId) {
      return c.json(
        { error: "トークンにsub（ユーザーID）が含まれていません" },
        401,
      );
    }

    // user.id で検索
    const userEntry = Object.entries(users).find(([, u]) => u.id === userId);
    if (!userEntry) {
      return c.json({ error: "ユーザーが見つかりません" }, 404);
    }

    const [key, user] = userEntry;
    return c.json({ key, ...user });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "トークンの検証に失敗しました";
    return c.json({ error: message }, 401);
  }
});

// アカウント作成
app.post("/users", async (c) => {
  const body = await c.req.json<{
    email?: string;
    name?: string;
    displayName?: string;
    roles?: string[];
  }>();

  if (!body.email || !body.name) {
    return c.json({ error: "email と name は必須です" }, 400);
  }

  try {
    const { key, user } = createUser({
      email: body.email,
      name: body.name,
      displayName: body.displayName,
      roles: body.roles,
    });
    return c.json({ key, ...user }, 201);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "アカウント作成に失敗しました";
    return c.json({ error: message }, 409);
  }
});

const port = Number.parseInt(process.env.PORT ?? "3007");

serve({
  fetch: app.fetch,
  port,
});

console.log(`Fake Auth server running at http://localhost:${port}`);
