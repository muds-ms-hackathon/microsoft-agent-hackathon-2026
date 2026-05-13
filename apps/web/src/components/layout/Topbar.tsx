import { Settings, UserCircle } from "lucide-react";

export function Topbar() {
  return (
    <header className="h-12 border-b border-border/50 flex items-center px-5 bg-background shadow-sm shrink-0 z-10">
      <span className="font-semibold text-base tracking-tight">Decision Loop</span>
      <div className="ml-auto flex items-center gap-1">
        {/* 設定ボタン（未実装） */}
        <button
          type="button"
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Settings size={18} />
        </button>
        {/* ユーザーアバター（未実装） */}
        <button
          type="button"
          className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <UserCircle size={26} />
        </button>
      </div>
    </header>
  );
}
