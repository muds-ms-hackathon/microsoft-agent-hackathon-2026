import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildRouterMock, MockLink } from "./router-mock";

describe("MockLink", () => {
  it("子要素を含む <a> 要素として描画する", () => {
    render(<MockLink to="/organizations">org</MockLink>);
    const anchor = screen.getByText("org");
    expect(anchor.tagName).toBe("A");
    expect(anchor.getAttribute("href")).toBe("/organizations");
  });

  it("to の $key を params の値で置換する", () => {
    render(
      <MockLink to="/orgs/$id" params={{ id: "abc" }}>
        link
      </MockLink>,
    );
    expect(screen.getByText("link").getAttribute("href")).toBe("/orgs/abc");
  });

  it("className と aria-label を <a> に伝播する", () => {
    render(
      <MockLink to="/" className="nav-link" aria-label="home">
        home
      </MockLink>,
    );
    const anchor = screen.getByText("home");
    expect(anchor).toHaveClass("nav-link");
    expect(anchor.getAttribute("aria-label")).toBe("home");
  });
});

describe("buildRouterMock", () => {
  it("override 未指定時は actual の export を継承しつつ Link のみ差し替える", async () => {
    const mock = await buildRouterMock();
    expect(mock.Link).toBe(MockLink);
    // useNavigate は actual のままなので関数として存在する
    expect(typeof mock.useNavigate).toBe("function");
    // 上書きしていないので useRouterState は actual のまま
    expect(typeof mock.useRouterState).toBe("function");
  });

  it("useNavigate を指定すると useNavigate() で渡した関数を返す", async () => {
    const navigateMock = vi.fn();
    const mock = await buildRouterMock({ useNavigate: navigateMock });
    expect(mock.useNavigate()).toBe(navigateMock);
  });

  it("routerState を指定すると useRouterState({ select }) で selector を適用する", async () => {
    const state = { location: { pathname: "/foo" } };
    const mock = await buildRouterMock({ routerState: () => state });
    expect(
      mock.useRouterState({
        select: (s: typeof state) => s.location.pathname,
      }),
    ).toBe("/foo");
  });

  it("routerState 指定で select 未指定なら state 全体を返す", async () => {
    const state = { location: { pathname: "/bar" } };
    const mock = await buildRouterMock({ routerState: () => state });
    expect(mock.useRouterState({})).toEqual(state);
  });

  it("mockFileRoute = true で createFileRoute が no-op になる", async () => {
    const mock = await buildRouterMock({ mockFileRoute: true });
    const route = mock.createFileRoute("/path")(() => ({}));
    expect(route).toEqual({});
  });

  it("mockFileRoute 未指定なら actual の createFileRoute を保持する", async () => {
    const mock = await buildRouterMock();
    // actual の createFileRoute は呼び出すと FileRouteOptions を要求するため、関数自体が存在することのみ確認
    expect(typeof mock.createFileRoute).toBe("function");
  });
});
