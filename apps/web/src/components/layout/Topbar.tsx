import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authAtom, logoutAtom } from "@/lib/auth";
import { getMsalInstance } from "@/lib/msalConfig";
import { useAtomValue, useSetAtom } from "jotai";
import { Mail, Settings } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";

const AUTH_PROVIDER =
  (import.meta.env.VITE_AUTH_PROVIDER as string) || "fake-auth";

// 名前の頭文字を取り出す。サロゲートペアを Array.from で正しく扱う。
function initial(name: string | null | undefined): string {
  if (!name) return "?";
  return Array.from(name.trim())[0] ?? "?";
}

function UserAvatar() {
  const logout = useSetAtom(logoutAtom);
  const navigate = useNavigate();
  const { user } = useAtomValue(authAtom);

  const handleLogout = async () => {
    logout();
    if (AUTH_PROVIDER === "entra") {
      try {
        const msal = getMsalInstance();
        await msal.initialize();
        await msal.logoutRedirect({
          postLogoutRedirectUri: window.location.origin + "/login",
        });
      } catch (e) {
        console.error("[logout] Entra ログアウトエラー:", e);
        navigate({ to: "/login" });
      }
    } else {
      navigate({ to: "/login" });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="ユーザーメニュー"
          className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold select-none hover:opacity-80 transition-opacity"
        >
          {initial(user?.name)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium">{user?.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {user?.email ?? "—"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleLogout}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          ログアウト
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  return (
    <header className="h-12 border-b border-border/50 flex items-center px-5 bg-background shadow-sm shrink-0 z-10">
      {/* アプリ名: index.tsx の h1 と重複するため "Decision Loop" は使わない */}
      <span className="font-semibold text-base tracking-tight">App Name</span>
      <div className="ml-auto flex items-center gap-1">
        {/* 自分宛の招待一覧への導線。未受諾招待数バッジ表示は follow-up 予定。 */}
        <Link
          to="/invitations"
          aria-label="招待一覧"
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          activeProps={{
            className:
              "p-2 rounded-md bg-muted text-foreground transition-colors",
          }}
        >
          <Mail size={18} />
        </Link>
        {/* 設定ボタン（未実装） */}
        <button
          type="button"
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Settings size={18} />
        </button>
        <UserAvatar />
      </div>
    </header>
  );
}
