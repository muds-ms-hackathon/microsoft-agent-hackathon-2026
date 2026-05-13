import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronDown, LayoutDashboard } from "lucide-react";

export function Sidebar() {
  return (
    <aside className="w-52 border-r border-border/50 bg-muted/30 flex flex-col shrink-0">
      {/* 組織セレクター（未実装） */}
      <button
        type="button"
        className="flex items-center gap-2.5 px-3 py-3 border-b border-border/50 hover:bg-muted/60 transition-colors text-left w-full"
      >
        <div className="w-6 h-6 rounded-md bg-muted-foreground/20 shrink-0" />
        <span className="text-sm font-medium truncate flex-1">組織名</span>
        <ChevronDown size={13} className="text-muted-foreground/70 shrink-0" />
      </button>

      {/* ナビゲーション */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1">
        <Link
          to="/"
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
          activeProps={{
            className:
              "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm bg-foreground/10 text-foreground font-medium",
          }}
        >
          <LayoutDashboard size={15} />
          ダッシュボード
        </Link>

        {/* 定例セクション（将来的にAPIから取得） */}
        <p className="px-2.5 pt-4 pb-1 text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
          定例
        </p>
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-foreground/70">
          <CalendarDays size={15} />
          <span className="truncate">〜定例会議</span>
        </div>
      </nav>
    </aside>
  );
}
