import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MockLink } from "./link-mock";

describe("MockLink (link-mock helper)", () => {
  it("子要素を含む <a> 要素として描画する", () => {
    render(<MockLink to="/organizations">org</MockLink>);
    const anchor = screen.getByText("org");
    expect(anchor.tagName).toBe("A");
    expect(anchor.getAttribute("href")).toBe("/organizations");
  });

  it("to の $key を params の値で置換する", () => {
    render(
      <MockLink to="/organizations/$id" params={{ id: "abc-123" }}>
        link
      </MockLink>,
    );
    expect(screen.getByText("link").getAttribute("href")).toBe(
      "/organizations/abc-123",
    );
  });

  it("params 未指定時は $key を空文字に置換する", () => {
    render(<MockLink to="/organizations/$id">link</MockLink>);
    expect(screen.getByText("link").getAttribute("href")).toBe(
      "/organizations/",
    );
  });

  it("複数の $key を含むパスを順に置換する", () => {
    render(
      <MockLink
        to="/orgs/$orgId/users/$userId"
        params={{ orgId: "o1", userId: "u1" }}
      >
        link
      </MockLink>,
    );
    expect(screen.getByText("link").getAttribute("href")).toBe(
      "/orgs/o1/users/u1",
    );
  });

  it("className を <a> 要素に伝播する", () => {
    render(
      <MockLink to="/" className="nav-link">
        home
      </MockLink>,
    );
    expect(screen.getByText("home")).toHaveClass("nav-link");
  });
});
