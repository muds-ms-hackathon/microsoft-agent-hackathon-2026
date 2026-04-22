import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const rootRoute = createRootRoute({
  component: () => (
    <div data-testid="root-layout">
      <Outlet />
    </div>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <p>ホーム</p>,
});

const routeTree = rootRoute.addChildren([indexRoute]);

describe("TanStack Router", () => {
  it("/ ルートが Index コンポーネントを描画する", async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("ホーム")).toBeInTheDocument();
  });
});
