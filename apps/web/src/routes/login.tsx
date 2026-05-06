import {
  getIdToken,
  loginAtom,
  saveExpectedAuthParams,
  verifyAndConsumeAuthParams,
} from "@/lib/auth";
import { readRequiredViteEnv } from "@/lib/env";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/login")({
  component: Login,
});

// PROD では未設定だと throw（デプロイ事故の早期検知）。DEV ではローカル
// fake-auth のデフォルト URL にフォールバックする。
const FAKE_AUTH_URL = readRequiredViteEnv(
  "VITE_FAKE_AUTH_URL",
  "http://localhost:3007",
);

function Login() {
  const navigate = useNavigate();
  const setLogin = useSetAtom(loginAtom);
  // state/nonce の検証は消費型（1 回限り）。React StrictMode の二重実行や
  // 親の再レンダリングによる useEffect 再実行で 2 回目に no_expected_params
  // と判定されないよう、明示的に 1 度だけハンドラを走らせる。
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

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
  }, [navigate, setLogin]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground">ログイン中...</p>
      </div>
    </div>
  );
}
