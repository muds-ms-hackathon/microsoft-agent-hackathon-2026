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
import {
  type OrganizationListItem,
  useOrganizationsQuery,
} from "@/features/organizations/hooks/useOrganizationsQuery";
import { CreateRecurringMeetingDialog } from "@/features/recurring-meetings/components/CreateRecurringMeetingDialog";
import { useOrganizationMeetings } from "@/features/recurring-meetings/hooks/useOrganizationMeetings";
import {
  clearCurrentOrganizationIdAtom,
  currentOrganizationIdAtom,
  setCurrentOrganizationIdAtom,
} from "@/lib/currentOrganization";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import {
  CalendarDays,
  CheckSquare,
  ChevronDown,
  LayoutDashboard,
  ListIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

// 組織アバター用の頭文字を取り出す。null/空文字を安全に扱う。
function initial(name: string | null | undefined): string {
  if (!name) return "?";
  // サロゲートペア (絵文字等) を 1 文字として扱うため Array.from で分割する。
  const chars = Array.from(name.trim());
  return chars[0] ?? "?";
}

// 組織詳細ページのパスにマッチする正規表現。
// `/organizations` (一覧) や `/organizations/` (末尾スラッシュのみ) は除外し、
// 末尾セグメントが 1 文字以上ある場合だけ詳細ページとみなす。
const ORGANIZATION_DETAIL_PATH = /^\/organizations\/[^/]+/;

export function Sidebar() {
  // useOrganizationsQuery は organizations.index.tsx と同じクエリキー
  // (["organizations"]) を使うため、一方の invalidate が両方に反映される。
  const { data: orgs, isLoading } = useOrganizationsQuery();
  const currentId = useAtomValue(currentOrganizationIdAtom);
  const setCurrentId = useSetAtom(setCurrentOrganizationIdAtom);
  const clearCurrentId = useSetAtom(clearCurrentOrganizationIdAtom);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createMeetingOpen, setCreateMeetingOpen] = useState(false);
  const navigate = useNavigate();
  // selector で必要な値だけ subscribe し、関係のない state 変化での再描画を抑える。
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  // 組織詳細ページを開いている時に組織を切り替えた場合、URL の id 部分は古いままで
  // 表示も古い組織の詳細を引き続き取得してしまう。同じ詳細ページの新しい id に
  // 自動遷移して内容を切り替える。それ以外のページではその場に留まる
  // (ダッシュボードや組織非依存ページで操作中のコンテキストを破壊しないため)。
  const handleSelectOrganization = (newId: string) => {
    setCurrentId(newId);
    if (ORGANIZATION_DETAIL_PATH.test(pathname)) {
      navigate({ to: "/organizations/$id", params: { id: newId } });
    }
  };

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
      className="w-52 border-r border-border/50 bg-muted/30 flex flex-col shrink-0 overflow-y-auto"
    >
      <OrganizationSelector
        isLoading={isLoading}
        orgs={orgs ?? null}
        currentOrg={currentOrg}
        currentId={currentId}
        onSelect={handleSelectOrganization}
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

        {/* My タスクへの導線。組織非依存（assignee 経由で組織横断）のため
            選択中組織のステータスを問わず常に表示する。 */}
        <Link
          to="/tasks"
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
          activeProps={{
            className:
              "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm bg-foreground/10 text-foreground font-medium",
          }}
        >
          <CheckSquare size={15} />
          My タスク
        </Link>

        {/* 定例セクション。選択中組織配下の定例を一覧表示する。
            クリック時の遷移先は定例詳細画面（/recurring-meetings/$id）で配下の会議一覧へ。
            組織が選択されているときだけ「+ 定例を追加」ボタンを表示する。 */}
        <div className="flex items-center justify-between pt-4 pb-1 pl-2.5 pr-1">
          <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
            定例
          </p>
          {currentId && (
            <button
              type="button"
              aria-label="定例を追加"
              onClick={() => setCreateMeetingOpen(true)}
              className="h-6 w-6 rounded-md text-muted-foreground/80 hover:bg-muted hover:text-foreground flex items-center justify-center"
            >
              <PlusIcon size={13} />
            </button>
          )}
        </div>
        <SidebarMeetingList orgId={currentId} />
        {currentId && (
          <CreateRecurringMeetingDialog
            orgId={currentId}
            open={createMeetingOpen}
            onOpenChange={setCreateMeetingOpen}
          />
        )}
      </nav>
    </aside>
  );
}

// サイドバーの「定例」セクション。選択中組織配下の定例を一覧表示する。
// 各項目クリックで組織詳細画面へ遷移し、サイドバー上では現在の組織コンテキストを
// 保ったまま定例を素早く認識できる状態にする。
function SidebarMeetingList({ orgId }: { orgId: string | null }) {
  const { data, isLoading, isError } = useOrganizationMeetings(orgId);

  if (orgId === null) return null;

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="定例一覧を読み込み中"
        className="px-2.5 py-2"
      >
        <div className="h-4 w-full rounded-md bg-muted-foreground/15 animate-pulse" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="px-2.5 py-2 text-xs text-destructive">
        定例の取得に失敗しました
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="px-2.5 py-2 text-xs text-muted-foreground/70">
        定例はまだありません
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5">
      {data.map((m) => (
        <li key={m.id}>
          <Link
            to="/recurring-meetings/$id"
            params={{ id: m.id }}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm text-foreground/70 hover:bg-muted hover:text-foreground transition-colors"
          >
            <CalendarDays size={15} className="shrink-0" />
            <span className="truncate">{m.name}</span>
          </Link>
        </li>
      ))}
    </ul>
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
  orgs: OrganizationListItem[] | null;
  currentOrg: OrganizationListItem | null;
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
            // ことがある。preventDefault でメニューの自動 close を抑止してから
            // ダイアログを開く。
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
