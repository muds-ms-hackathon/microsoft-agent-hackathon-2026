import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { SignJWT, exportJWK, importPKCS8, importSPKI } from "jose";
import { getAllUsers, getUserByKey } from "./users.js";

const app = new Hono();

const keysDir = join(import.meta.dirname, "..", "keys");
const privateKeyPem = readFileSync(join(keysDir, "private.pem"), "utf-8");
const publicKeyPem = readFileSync(join(keysDir, "public.pem"), "utf-8");

const KEY_ID = "fake-auth-key-1";
const ISSUER = process.env.ISSUER ?? "http://localhost:3007";

async function getPrivateKey() {
  return await importPKCS8(privateKeyPem, "RS256");
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
  const publicKey = await importSPKI(publicKeyPem, "RS256");
  const jwk = await exportJWK(publicKey);

  return c.json({
    keys: [
      {
        ...jwk,
        kid: KEY_ID,
        use: "sig",
        alg: "RS256",
        kty: "RSA",
      },
    ],
  });
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

  const privateKey = await getPrivateKey();

  const idToken = await new SignJWT({
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

  // Redirect with fragment (implicit flow style)
  const redirectUrl = new URL(redirectUri);
  const hash = new URLSearchParams();
  hash.set("id_token", idToken);
  if (state) hash.set("state", state);
  redirectUrl.hash = hash.toString();

  return c.redirect(redirectUrl.toString());
});

const port = Number.parseInt(process.env.PORT ?? "3007");

serve({
  fetch: app.fetch,
  port,
});

console.log(`Fake Auth server running at http://localhost:${port}`);
