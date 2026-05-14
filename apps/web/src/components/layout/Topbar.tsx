import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authAtom, logoutAtom } from "@/lib/auth";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { Settings } from "lucide-react";

// 名前の頭文字を取り出す。サロゲートペアを Array.from で正しく扱う。
function initial(name: string | null | undefined): string {
  if (!name) return "?";
  return Array.from(name.trim())[0] ?? "?";
}

function UserAvatar() {
  const auth = useAtomValue(authAtom);
  const logout = useSetAtom(logoutAtom);
  const navigate = useNavigate();
  const user = auth.isAuthenticated ? auth.user : null;

  const handleLogout = () => {
    logout();
    navigate({ to: "/login" });
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
