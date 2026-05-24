// Entra External ID (CIAM) の MSAL 設定。
// VITE_AUTH_PROVIDER=entra のときのみ使用する。
// getMsalInstance() は遅延初期化のため、VITE_AUTH_PROVIDER=fake-auth の場合は
// 呼ばれず、Entra 関連の環境変数が未設定でも問題ない。

import {
  type Configuration,
  PublicClientApplication,
} from "@azure/msal-browser";

function getEntraConfig(): Configuration {
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

  const resolvedAuthority = (authority ?? "").replace(/\/+$/, "");

  // CIAM エンドポイント (*.ciamlogin.com) は MSAL の既定の信頼済みホストではないため、
  // knownAuthorities に明示する必要がある。
  const knownAuthorities = resolvedAuthority
    ? [new URL(resolvedAuthority).hostname]
    : [];

  return {
    auth: {
      clientId: clientId ?? "",
      authority: resolvedAuthority,
      redirectUri: redirectUri ?? `${window.location.origin}/login`,
      knownAuthorities,
      // ログイン後に元のリクエスト URL へ自動遷移させない。
      // SPA では TanStack Router 側でリダイレクト先を制御するため無効化する。
      navigateToLoginRequestUrl: false,
    },
    cache: {
      // sessionStorage は localStorage より安全（タブを閉じると消える）
      cacheLocation: "sessionStorage",
    },
  };
}

let _msalInstance: PublicClientApplication | undefined;

// MSAL インスタンスを取得する（初回呼び出し時に生成）。
// loginRedirect / handleRedirectPromise の前に initialize() を呼ぶこと。
export function getMsalInstance(): PublicClientApplication {
  if (!_msalInstance) {
    _msalInstance = new PublicClientApplication(getEntraConfig());
  }
  return _msalInstance;
}

// Entra ID に要求するスコープ。ID Token の標準クレーム取得に必要な最小セット。
export const ENTRA_SCOPES = ["openid", "profile", "email"];
