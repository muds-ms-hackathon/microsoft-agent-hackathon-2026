import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { getIdToken } from "@/lib/auth";
import {
  Outlet,
  createRootRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router";

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
  component: RootLayout,
});

function RootLayout() {
  const { location } = useRouterState();
  const isLogin = location.pathname === "/login";

  // ログインページにはレイアウトを表示しない
  if (isLogin) {
    return <Outlet />;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <Topbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
