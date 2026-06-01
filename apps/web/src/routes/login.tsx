import {
  getIdToken,
  loginAtom,
  parseToken,
  saveExpectedAuthParams,
  userEmailAtom,
  verifyAndConsumeAuthParams,
} from "@/lib/auth";
import { readRequiredViteEnv } from "@/lib/env";
import {
  ENTRA_SCOPES,
  fetchUserInfoEmail,
  getMsalInstance,
} from "@/lib/msalConfig";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/login")({
  component: Login,
});

// 認証プロバイダの選択。デフォルトは fake-auth（ローカル開発用）。
// 本番 Entra External ID 環境では VITE_AUTH_PROVIDER=entra を設定する。
const AUTH_PROVIDER =
  (import.meta.env.VITE_AUTH_PROVIDER as string) || "fake-auth";

// PROD では未設定だと throw（デプロイ事故の早期検知）。DEV ではローカル
// fake-auth のデフォルト URL にフォールバックする。
// VITE_AUTH_PROVIDER=entra の場合は参照しないため評価を遅延させる。
const FAKE_AUTH_URL =
  AUTH_PROVIDER === "fake-auth"
    ? readRequiredViteEnv("VITE_FAKE_AUTH_URL", "http://localhost:3007")
    : "";

function Login() {
  const navigate = useNavigate();
  const setLogin = useSetAtom(loginAtom);
  const setUserEmail = useSetAtom(userEmailAtom);
  const [error, setError] = useState<string | null>(null);
  // state/nonce の検証は消費型（1 回限り）。React StrictMode の二重実行や
  // 親の再レンダリングによる useEffect 再実行で 2 回目に no_expected_params
  // と判定されないよう、明示的に 1 度だけハンドラを走らせる。
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    if (AUTH_PROVIDER === "entra") {
      handleEntraLogin();
      return;
    }

    handleFakeAuthLogin();

    async function handleEntraLogin() {
      try {
        const msal = await getMsalInstance();

        // リダイレクト後のコールバック処理。result が null の場合は認証前。
        // navigateToLoginRequestUrl: false でリダイレクト完了後に元 URL へ戻る動作を抑制する。
        // MSAL v5 では Configuration ではなく handleRedirectPromise のオプションに移動した。
        const result = await msal.handleRedirectPromise({
          navigateToLoginRequestUrl: false,
        });

        if (result?.idToken) {
          // parseToken でクレームを検証してから保存する。
          // 検証なしに setLogin すると beforeLoad で token が除去されて
          // /login → / → /login の無限ループが発生する。
          const parsed = parseToken(result.idToken);
          if (!parsed) {
            setError(
              "認証トークンが無効または期限切れです。管理者に連絡してください。",
            );
            return;
          }
          // MSAL が返す idToken を既存の localStorage ベースの仕組みに橋渡しする
          setLogin(result.idToken);

          // ID トークンにメールがない場合のみ UserInfo エンドポイントから取得する
          if (!parsed.email) {
            const email = await fetchUserInfoEmail(result.accessToken);
            if (email) {
              setUserEmail(email);
              const res = await fetch("/api/me", {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${result.idToken}`,
                },
                body: JSON.stringify({ email }),
              });
              if (!res.ok) {
                console.warn("[login] PATCH /me failed:", res.status);
              }
            }
          }

          navigate({ to: "/" });
          return;
        }

        // 既にログイン済みの場合はホームへ
        if (getIdToken()) {
          navigate({ to: "/" });
          return;
        }

        // 未認証: Entra ID へリダイレクト（MSAL が PKCE を内部処理）
        await msal.loginRedirect({ scopes: ENTRA_SCOPES });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("[login] Entra 認証エラー:", e);
        setError(message);
      }
    }

    function handleFakeAuthLogin() {
      // URLのhashからid_tokenを取得（fake-authのimplicit flow）
      const hash = window.location.hash.slice(1);
      const params = new URLSearchParams(hash);
      const idToken = params.get("id_token");
      const actualState = params.get("state");

      if (idToken) {
        // hash は成功・失敗にかかわらず即座にクリアする（漏洩・二重消費防止）
        window.history.replaceState(null, "", window.location.pathname);
        const verification = verifyAndConsumeAuthParams(actualState, idToken);
        if (verification.ok) {
          setLogin(idToken);
          navigate({ to: "/" });
          return;
        }
        // 検証失敗時はトークンを採用せず、再度 /authorize に流す
        console.error(
          "[login] OIDC コールバック検証失敗:",
          verification.reason,
        );
      }

      // 既にログイン済みのユーザーが /login に直接アクセスした場合は / に戻す
      if (getIdToken()) {
        navigate({ to: "/" });
        return;
      }

      // トークンがない場合はfake-authにリダイレクト
      const currentUrl = new URL(window.location.href);
      // hashを除去したURLをredirect_uriに使用
      currentUrl.hash = "";
      const redirectUri = currentUrl.toString();

      const state = crypto.randomUUID();
      const nonce = crypto.randomUUID();
      saveExpectedAuthParams(state, nonce);

      const authUrl = new URL(`${FAKE_AUTH_URL}/authorize`);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("nonce", nonce);

      window.location.href = authUrl.toString();
    }
  }, [navigate, setLogin, setUserEmail]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        {error ? (
          <p className="text-destructive">認証エラー: {error}</p>
        ) : (
          <p className="text-muted-foreground">ログイン中...</p>
        )}
      </div>
    </div>
  );
}
