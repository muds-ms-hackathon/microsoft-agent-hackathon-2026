import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateOrganizationDialog } from "@/features/organizations/components/CreateOrganizationDialog";
import type { Organization } from "@/features/organizations/types";
import { api, authHeaders } from "@/lib/api";
import {
  clearCurrentOrganizationIdAtom,
  currentOrganizationIdAtom,
  setCurrentOrganizationIdAtom,
} from "@/lib/currentOrganization";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import {
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  ListIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

// 組織一覧フェッチ。クエリキー / fetcher は organizations.index.tsx と
// 完全に同一にしておくことで、TanStack Query のキャッシュを共有する。
// 結果として、一覧ページや作成ダイアログで invalidate された変更が
// サイドバーにも即座に反映される。
function useOrganizations() {
  return useQuery<Organization[]>({
    queryKey: ["organizations"],
    queryFn: async () => {
      const res = await api.organizations.$get(undefined, authHeaders());
      if (!res.ok) {
        throw new Error(`Failed to fetch organizations: ${res.status}`);
      }
      return (await res.json()) as Organization[];
    },
  });
}

// 組織アバター用の頭文字を取り出す。null/空文字を安全に扱う。
function initial(name: string | null | undefined): string {
  if (!name) return "?";
  // サロゲートペア (絵文字等) を 1 文字として扱うため Array.from で分割する。
  const chars = Array.from(name.trim());
  return chars[0] ?? "?";
}

export function Sidebar() {
  const { data: orgs, isLoading } = useOrganizations();
  const currentId = useAtomValue(currentOrganizationIdAtom);
  const setCurrentId = useSetAtom(setCurrentOrganizationIdAtom);
  const clearCurrentId = useSetAtom(clearCurrentOrganizationIdAtom);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // 組織一覧の取得結果を見て「現在の組織 ID」を整合させる。
  //   - 一覧が空 → null にリセット (退会・削除直後など)
  //   - 一覧があり、現在 ID が未設定 or 一覧に存在しない → 先頭を採用
  // 「常にどれかが選択されている」状態を保つことで、サイドバーや詳細リンクの
  // 表示分岐をシンプルにする。
  useEffect(() => {
    if (!orgs) return;
    if (orgs.length === 0) {
      if (currentId !== null) clearCurrentId();
      return;
    }
    const stillExists = currentId
      ? orgs.some((o) => o.id === currentId)
      : false;
    if (!stillExists) {
      setCurrentId(orgs[0].id);
    }
  }, [orgs, currentId, setCurrentId, clearCurrentId]);

  const currentOrg = orgs?.find((o) => o.id === currentId) ?? null;

  return (
    <aside
      aria-label="サイドバー"
      className="w-52 border-r border-border/50 bg-muted/30 flex flex-col shrink-0"
    >
      <OrganizationSelector
        isLoading={isLoading}
        orgs={orgs ?? null}
        currentOrg={currentOrg}
        currentId={currentId}
        onSelect={setCurrentId}
        onOpenCreateDialog={() => setCreateDialogOpen(true)}
      />

      {/* 制御モードの作成ダイアログ。サイドバーのトリガー (CTA / メニュー項目)
          から open=true にし、作成成功時は currentId を新組織に切り替える。 */}
      <CreateOrganizationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={(id) => setCurrentId(id)}
      />

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

        {/* 定例セクション（API 実装後に Issue #86 / #89 で連動予定） */}
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

// サイドバー上部の「組織エリア」を切り出した内部コンポーネント。
// 状態は親が管理し、こちらは表示分岐とイベント転送のみを担う。
function OrganizationSelector({
  isLoading,
  orgs,
  currentOrg,
  currentId,
  onSelect,
  onOpenCreateDialog,
}: {
  isLoading: boolean;
  orgs: Organization[] | null;
  currentOrg: Organization | null;
  currentId: string | null;
  onSelect: (id: string) => void;
  onOpenCreateDialog: () => void;
}) {
  if (isLoading) {
    // 取得中はレイアウトずれを避けるためボタンと同じ高さのスケルトンを置く。
    return (
      <div
        role="status"
        aria-label="組織一覧を読み込み中"
        className="h-12 border-b border-border/50 px-3 py-3 flex items-center"
      >
        <div className="h-6 w-full rounded-md bg-muted-foreground/15 animate-pulse" />
      </div>
    );
  }

  if (!orgs || orgs.length === 0) {
    // 0 件のときは作成 CTA のみを表示する。強制的にダイアログを開かないのは、
    // 招待リンク経由で参加するユーザーが居ても邪魔にならないようにするため。
    return (
      <button
        type="button"
        onClick={onOpenCreateDialog}
        className="flex items-center gap-2.5 px-3 py-3 border-b border-border/50 hover:bg-muted/60 transition-colors text-left w-full"
      >
        <div className="w-6 h-6 rounded-md bg-muted-foreground/20 shrink-0 flex items-center justify-center">
          <PlusIcon size={13} />
        </div>
        <span className="text-sm font-medium truncate flex-1">
          新しい組織を作成
        </span>
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="組織を切り替え"
          className="flex items-center gap-2.5 px-3 py-3 border-b border-border/50 hover:bg-muted/60 transition-colors text-left w-full"
        >
          <div className="w-6 h-6 rounded-md bg-muted-foreground/20 shrink-0 flex items-center justify-center text-[11px] font-semibold uppercase">
            {initial(currentOrg?.name)}
          </div>
          <span className="text-sm font-medium truncate flex-1">
            {currentOrg?.name ?? "組織を選択"}
          </span>
          <ChevronDown
            size={13}
            className="text-muted-foreground/70 shrink-0"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        // トリガーの幅に概ね合わせる。ChevronDown が右端に来るデザインに揃える。
        className="w-56"
      >
        <DropdownMenuLabel>組織を切り替え</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={currentId ?? ""}
          onValueChange={(value) => {
            // RadioGroup の onValueChange は同値選択でも発火することがあるため
            // 念のため変化時のみ書き込む。
            if (value && value !== currentId) onSelect(value);
          }}
        >
          {orgs.map((o) => (
            <DropdownMenuRadioItem key={o.id} value={o.id}>
              <span className="truncate">{o.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {currentId ? (
          <DropdownMenuItem asChild>
            <Link
              to="/organizations/$id"
              params={{ id: currentId }}
              className="cursor-pointer"
            >
              <SettingsIcon />
              現在の組織の詳細
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/organizations" className="cursor-pointer">
            <ListIcon />
            すべての組織を見る
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            // onSelect のデフォルト挙動でメニューが閉じた直後にダイアログを
            // 開こうとすると Radix の focus 管理と競合してフォーカスがずれる
            // ことがある。preventDefault でメニューの自動 close を抑止し、
            // setTimeout で 1 tick 遅らせてからダイアログを開く。
            e.preventDefault();
            onOpenCreateDialog();
          }}
          className="cursor-pointer"
        >
          <PlusIcon />
          新しい組織を作成
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
