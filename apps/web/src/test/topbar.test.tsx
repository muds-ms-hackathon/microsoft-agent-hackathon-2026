import { Topbar } from "@/components/layout/Topbar";
import { loginAtom } from "@/lib/auth";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { makeFakeIdToken } from "./helpers/auth";

// ログアウト時の useNavigate を検証するため、navigateMock を hoisted で共有する。
const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("@tanstack/react-router", async () => {
  const { buildRouterMock } = await import("./helpers/router-mock");
  return buildRouterMock({ useNavigate: navigateMock });
});

// 設定ダイアログ内のフックをモックし、QueryClient 無しでも描画できるようにする。
vi.mock("@/features/settings/hooks/useMe", () => ({
  useMe: () => ({
    data: {
      id: "user-1",
      email: "me@example.com",
      name: "Me User",
      displayName: "現在の名前",
    },
    isLoading: false,
  }),
}));
vi.mock("@/features/settings/hooks/useUpdateDisplayName", () => ({
  useUpdateDisplayName: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
}));

function renderTopbar(name = "田中太郎", email = "tanaka@example.com") {
  const store = createStore();
  store.set(loginAtom, makeFakeIdToken({ sub: "u1", name, email }));
  return {
    user: userEvent.setup(),
    ...render(
      <Provider store={store}>
        <Topbar />
      </Provider>,
    ),
  };
}

describe("Topbar", () => {
  it("アバターに名前の頭文字が表示される", () => {
    renderTopbar("田中太郎");
    expect(
      screen.getByRole("button", { name: "ユーザーメニュー" }),
    ).toHaveTextContent("田");
  });

  it("招待一覧へのリンクが /invitations を指して表示される", () => {
    renderTopbar();
    const link = screen.getByRole("link", { name: "招待一覧" });
    expect(link).toHaveAttribute("href", "/invitations");
  });

  it("ログアウトをクリックすると /login へ遷移する", async () => {
    const { user } = renderTopbar();

    await user.click(screen.getByRole("button", { name: "ユーザーメニュー" }));
    await user.click(screen.getByText("ログアウト"));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/login" });
    });
  });

  it("設定ボタンが表示される", () => {
    renderTopbar();
    expect(screen.getByRole("button", { name: "設定" })).toBeInTheDocument();
  });

  it("設定ボタンを押すと設定ダイアログが開く", async () => {
    const { user } = renderTopbar();
    // 初期状態ではダイアログは閉じている。
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "設定" }));
    // 開くと表示名の入力欄を持つダイアログが現れる。
    const dialog = await screen.findByRole("dialog", { name: "設定" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("表示名")).toBeInTheDocument();
  });
});
