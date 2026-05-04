import { getIdToken, loginAtom } from "@/lib/auth";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useEffect } from "react";

export const Route = createFileRoute("/login")({
  component: Login,
});

const FAKE_AUTH_URL = import.meta.env.VITE_FAKE_AUTH_URL ?? "http://localhost:3007";

function Login() {
  const navigate = useNavigate();
  const setLogin = useSetAtom(loginAtom);

  useEffect(() => {
    // URLのhashからid_tokenを取得（fake-authのimplicit flow）
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const idToken = params.get("id_token");

    if (idToken) {
      // トークンを保存してリダイレクト
      setLogin(idToken);
      // hashを消してクリーンなURLに
      window.history.replaceState(null, "", window.location.pathname);
      navigate({ to: "/" });
      return;
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

    const authUrl = new URL(`${FAKE_AUTH_URL}/authorize`);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", crypto.randomUUID());
    authUrl.searchParams.set("nonce", crypto.randomUUID());

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
