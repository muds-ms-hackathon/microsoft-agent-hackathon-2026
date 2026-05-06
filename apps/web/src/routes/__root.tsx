import { getIdToken } from "@/lib/auth";
import { Outlet, createRootRoute, redirect } from "@tanstack/react-router";

export const Route = createRootRoute({
  beforeLoad: ({ location }) => {
    // ログインページへのアクセスは常に許可
    if (location.pathname === "/login") {
      return;
    }

    const token = getIdToken();
    if (!token) {
      throw redirect({
        to: "/login",
      });
    }
  },
  component: () => (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  ),
});
