// Entra ID 分岐（VITE_AUTH_PROVIDER=entra）のテスト。
// AUTH_PROVIDER はモジュールレベル定数のため、vi.resetModules() + dynamic import で
// 各テスト前に entra 設定として再ロードする。

import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { atom } from "jotai";
import { Provider as JotaiProvider, createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// MSAL インスタンスのモック。テスト間で共有し、beforeEach でリセットする。
const mockMsal = {
  initialize: vi.fn().mockResolvedValue(undefined),
  handleRedirectPromise: vi.fn(),
  loginRedirect: vi.fn().mockResolvedValue(undefined),
};

// @/lib/msalConfig を常にモックとして差し替える（vi.mock は巻き上げられる）
vi.mock("@/lib/msalConfig", () => ({
  getMsalInstance: () => mockMsal,
  ENTRA_SCOPES: ["openid", "profile", "email"],
}));

// @/lib/auth は atomWithStorage を使い module load 時に localStorage を参照するため、
// vi.resetModules() 後の動的 import で localStorage 未初期化エラーが起きる。
// importOriginal を使わず、純粋な atom だけで構成した完全モックで代替する。
const loginSpy = vi.fn<[string], void>();
const loginAtom = atom(null, (_get, _set, token: string) => {
  loginSpy(token);
});
const logoutAtom = atom(null, () => {});
const authAtom = atom({ isAuthenticated: false, idToken: null as string | null, user: null });

vi.mock("@/lib/auth", () => ({
  loginAtom,
  logoutAtom,
  authAtom,
  getIdToken: vi.fn(),
  saveExpectedAuthParams: vi.fn(),
  verifyAndConsumeAuthParams: vi.fn(),
  parseToken: vi.fn(),
  getInitialState: vi
    .fn()
    .mockReturnValue({ isAuthenticated: false, idToken: null, user: null }),
}));

describe("Login コンポーネント (AUTH_PROVIDER=entra)", () => {
  beforeEach(async () => {
    // vi.stubEnv で vitest の env システムに正しく登録してから resetModules する。
    // 直接 import.meta.env への代入は vitest の transform を経由しないため使わない。
    vi.stubEnv("VITE_AUTH_PROVIDER", "entra");
    // モジュールキャッシュをクリアして AUTH_PROVIDER を stub 後の値で再評価させる
    vi.resetModules();
    vi.clearAllMocks();
    mockMsal.initialize.mockResolvedValue(undefined);
    mockMsal.loginRedirect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // テスト用ルーターを組み立て、resetModules 後に再ロードした Login を /login に配置する
  async function renderLogin() {
    const { Route } = await import("@/routes/login");
    const LoginComponent = Route.options.component as React.ComponentType;

    const rootRoute = createRootRoute({ component: Outlet });
    const loginRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/login",
      component: LoginComponent,
    });
    const homeRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => null,
    });
    const store = createStore();
    const router = createRouter({
      routeTree: rootRoute.addChildren([loginRoute, homeRoute]),
      history: createMemoryHistory({ initialEntries: ["/login"] }),
    });

    render(
      <JotaiProvider store={store}>
        <RouterProvider router={router} />
      </JotaiProvider>,
    );

    return { router, store };
  }

  it("コールバックで idToken が返された場合、loginAtom にトークンをセットしてホームへ遷移する", async () => {
    const { makeFakeIdToken } = await import("../test/helpers/auth");
    const { getIdToken } = await import("@/lib/auth");

    const fakeToken = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
    });
    mockMsal.handleRedirectPromise.mockResolvedValue({ idToken: fakeToken });
    vi.mocked(getIdToken).mockReturnValue(null);

    const { router } = await renderLogin();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(loginSpy).toHaveBeenCalledWith(fakeToken);
    expect(mockMsal.loginRedirect).not.toHaveBeenCalled();
  });

  it("既にログイン済みの場合は loginRedirect を呼ばずホームへ遷移する", async () => {
    const { makeFakeIdToken } = await import("../test/helpers/auth");
    const { getIdToken } = await import("@/lib/auth");

    const fakeToken = makeFakeIdToken({
      sub: "u1",
      email: "u1@example.com",
      name: "u1",
    });
    mockMsal.handleRedirectPromise.mockResolvedValue(null);
    vi.mocked(getIdToken).mockReturnValue(fakeToken);

    const { router } = await renderLogin();

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(mockMsal.loginRedirect).not.toHaveBeenCalled();
  });

  it("未認証かつコールバックなしの場合は loginRedirect を呼び出す", async () => {
    const { getIdToken } = await import("@/lib/auth");

    mockMsal.handleRedirectPromise.mockResolvedValue(null);
    vi.mocked(getIdToken).mockReturnValue(null);

    await renderLogin();

    await waitFor(() => {
      expect(mockMsal.loginRedirect).toHaveBeenCalledWith(
        expect.objectContaining({ scopes: ["openid", "profile", "email"] }),
      );
    });
  });
});
