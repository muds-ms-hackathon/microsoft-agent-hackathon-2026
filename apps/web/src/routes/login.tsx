import {
  getIdToken,
  loginAtom,
  saveExpectedAuthParams,
  verifyAndConsumeAuthParams,
} from "@/lib/auth";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useEffect } from "react";

export const Route = createFileRoute("/login")({
  component: Login,
});

const FAKE_AUTH_URL =
  import.meta.env.VITE_FAKE_AUTH_URL ?? "http://localhost:3007";

function Login() {
  const navigate = useNavigate();
  const setLogin = useSetAtom(loginAtom);

  useEffect(() => {
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
      console.error("[login] OIDC コールバック検証失敗:", verification.reason);
    }

    // StrictModeの二重実行等で既にlocalStorageにトークンがある場合は/に遷移
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
  }, [navigate, setLogin]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">ログイン中...</p>
      </div>
    </div>
  );
}
