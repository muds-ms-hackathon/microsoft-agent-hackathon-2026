// Entra External ID (CIAM) の MSAL 設定。
// VITE_AUTH_PROVIDER=entra のときのみ使用する。
// getMsalInstance() は遅延初期化のため、VITE_AUTH_PROVIDER=fake-auth の場合は
// 呼ばれず、Entra 関連の環境変数が未設定でも問題ない。

import {
  type Configuration,
  PublicClientApplication,
} from "@azure/msal-browser";

function getEntraConfig(authorityMetadata?: string): Configuration {
  const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID as string | undefined;
  const authority = import.meta.env.VITE_ENTRA_AUTHORITY as string | undefined;
  const redirectUri = import.meta.env.VITE_ENTRA_REDIRECT_URI as
    | string
    | undefined;

  if (import.meta.env.PROD && !clientId) {
    throw new Error(
      'Required Vite env "VITE_ENTRA_CLIENT_ID" is not set. Set it before building for production.',
    );
  }
  if (import.meta.env.PROD && !authority) {
    throw new Error(
      'Required Vite env "VITE_ENTRA_AUTHORITY" is not set. Set it before building for production.',
    );
  }
  if (import.meta.env.PROD && !redirectUri) {
    throw new Error(
      'Required Vite env "VITE_ENTRA_REDIRECT_URI" is not set. Set it before building for production.',
    );
  }

  const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID as string | undefined;

  const resolvedAuthority = (authority ?? "").replace(/\/+$/, "");

  // CIAM エンドポイント (*.ciamlogin.com) は MSAL の既定の信頼済みホストではないため、
  // knownAuthorities に明示する必要がある。
  const knownAuthorities: string[] = [];
  if (resolvedAuthority) {
    knownAuthorities.push(new URL(resolvedAuthority).hostname);
  }
  if (tenantId) {
    knownAuthorities.push(`${tenantId}.ciamlogin.com`);
  }

  return {
    auth: {
      clientId: clientId ?? "",
      authority: resolvedAuthority,
      redirectUri: redirectUri ?? `${window.location.origin}/login`,
      knownAuthorities,
      ...(authorityMetadata ? { authorityMetadata } : {}),
    },
    cache: {
      // sessionStorage は localStorage より安全（タブを閉じると消える）
      cacheLocation: "sessionStorage",
    },
  };
}

let _msalInstance: PublicClientApplication | undefined;

// CIAM の OIDC discovery issuer（GUID ベース）が MSAL の期待するテナント名ベースの
// パターンと一致せず validateIssuer で失敗するため、authorityMetadata を事前に
// 取得して渡すことでネットワーク経由の validateIssuer をバイパスする。
async function fetchAuthorityMetadata(
  authority: string,
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `${authority}/v2.0/.well-known/openid-configuration`,
    );
    return res.ok ? await res.text() : undefined;
  } catch {
    return undefined;
  }
}

// MSAL インスタンスを取得する（初回呼び出し時に生成・初期化）。
// initialize() も内部で完了させるため、呼び出し側での追加呼び出しは不要。
export async function getMsalInstance(): Promise<PublicClientApplication> {
  if (_msalInstance) return _msalInstance;
  const authority = (
    (import.meta.env.VITE_ENTRA_AUTHORITY as string) ?? ""
  ).replace(/\/+$/, "");
  const authorityMetadata = await fetchAuthorityMetadata(authority);
  const instance = new PublicClientApplication(
    getEntraConfig(authorityMetadata),
  );
  await instance.initialize();
  _msalInstance = instance;
  return _msalInstance;
}

// Entra ID に要求するスコープ。ID Token の標準クレーム取得に必要な最小セット。
export const ENTRA_SCOPES = ["openid", "profile", "email"];

// Entra External ID (CIAM) の UserInfo エンドポイント。
// discovery document の userinfo_endpoint（ciamlogin.com）は CORS 非対応のため、
// CORS 対応の graph.microsoft.com エンドポイントを直接使用する。
const GRAPH_USERINFO_URL = "https://graph.microsoft.com/oidc/userinfo";

// アクセストークンで UserInfo を呼び出してメールアドレスを返す。
export async function fetchUserInfoEmail(
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(GRAPH_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const info = (await res.json()) as {
      email?: string;
      preferred_username?: string;
    };
    return info.email ?? info.preferred_username ?? null;
  } catch {
    return null;
  }
}
