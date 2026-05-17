import { Topbar } from "@/components/layout/Topbar";
import { loginAtom } from "@/lib/auth";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { makeFakeIdToken } from "./helpers/auth";

const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

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

  it("ログアウトをクリックすると /login へ遷移する", async () => {
    const { user } = renderTopbar();

    await user.click(screen.getByRole("button", { name: "ユーザーメニュー" }));
    await user.click(screen.getByText("ログアウト"));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: "/login" });
    });
  });
});
