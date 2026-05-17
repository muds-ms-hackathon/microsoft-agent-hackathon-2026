import { TaskRow } from "@/features/tasks/components/TaskRow";
import { useMyTasks } from "@/features/tasks/hooks/useMyTasks";
import { taskStatusLabels } from "@/features/tasks/labels";
import type { TaskListItem, TaskStatus } from "@/features/tasks/types";
import { currentOrganizationIdAtom } from "@/lib/currentOrganization";
import { cn } from "@/lib/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { z } from "zod";

// 組織フィルタの「すべて」を URL で明示するためのセンチネル値。
// `orgId` が未指定の時はサイドバー選択中の組織で初期フィルタする挙動とし、
// ユーザーが明示的に「すべて」を選んだ場合はこの値を URL に保持する。
const ALL_ORGS_SENTINEL = "all";

// 手動経路で表示する status の選択肢。draft / reviewing は AI 専用のため UI から除外する。
const FILTERABLE_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "done",
  "rejected",
];

// URL クエリパラメータの形（生の文字列）。
// status は API 仕様に合わせてカンマ区切り文字列で永続化する。
const tasksSearchSchema = z.object({
  status: z.string().optional(),
  orgId: z.string().optional(),
});

type TasksSearch = z.infer<typeof tasksSearchSchema>;

export const Route = createFileRoute("/tasks/")({
  validateSearch: tasksSearchSchema,
  component: MyTasksPage,
});

// URL の status 文字列を TaskStatus 配列にパースする。
// 不正値は無視（前方互換）。
function parseStatusParam(raw: string | undefined): TaskStatus[] | undefined {
  if (!raw) return undefined;
  const arr = raw
    .split(",")
    .map((v) => v.trim())
    .filter((v): v is TaskStatus =>
      FILTERABLE_STATUSES.includes(v as TaskStatus),
    );
  return arr.length > 0 ? arr : undefined;
}

// route component から分離したビュー。テストでは props で初期 search / now / currentOrgId を
// 直接 render する（既存の OrganizationDetailView と同じ流儀）。
// currentOrgId はサイドバー選択中の組織。URL に orgId が無いときの初期フィルタとして使う。
export function MyTasksView({
  search,
  onSearchChange,
  currentOrgId = null,
  now,
}: {
  search: TasksSearch;
  onSearchChange: (next: TasksSearch) => void;
  currentOrgId?: string | null;
  now?: Date;
}) {
  const statusArr = parseStatusParam(search.status);

  // effective orgId の決定ロジック:
  //  - URL に orgId="all" → フィルタなし（ユーザーが明示的にすべてを選んだ）
  //  - URL に orgId=<id>  → その組織でフィルタ（URL が常に優先）
  //  - URL に orgId 未指定 → サイドバーの currentOrgId にフォールバック（初期表示用）
  // currentOrgId が null（未選択）の場合は結果的にフィルタなしになる。
  const effectiveOrgId: string | null =
    search.orgId === ALL_ORGS_SENTINEL ? null : (search.orgId ?? currentOrgId);

  // API には組織フィルタが無いため、status のみを API に渡してクライアント側で組織を絞り込む。
  // タスクは全件返却前提のため、組織でさらに削ってもパフォーマンス問題は出ない想定。
  const { data, isLoading, isError } = useMyTasks(
    statusArr ? { status: statusArr } : undefined,
  );

  const tasks = data ?? [];
  // 組織候補は取得した tasks から動的に構築する。useMyOrganizations を別途呼ばない方針。
  const organizations = uniqueOrganizations(tasks);
  const filtered = effectiveOrgId
    ? tasks.filter((t) => t.organization.id === effectiveOrgId)
    : tasks;

  const toggleStatus = (s: TaskStatus) => {
    const current = new Set(statusArr ?? []);
    if (current.has(s)) current.delete(s);
    else current.add(s);
    const next = Array.from(current);
    onSearchChange({
      ...search,
      status: next.length > 0 ? next.join(",") : undefined,
    });
  };

  return (
    <section
      aria-labelledby="my-tasks-title"
      className="container mx-auto p-8 space-y-6"
    >
      <header>
        <h1 id="my-tasks-title" className="text-2xl font-bold">
          My タスク
        </h1>
        <p className="text-sm text-muted-foreground">
          自分が担当中のタスクを組織横断で表示します
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* fieldset/legend だと legend がブロック扱いで「ステータス」が
            上段に押し出され、組織ラベルとベースラインが揃わない。
            biome の useSemanticElements は fieldset を勧めるが、本ケースでは
            視覚整列を優先し、a11y は aria-labelledby で代替する。 */}
        {/* biome-ignore lint/a11y/useSemanticElements: legend が要素を改行させるため fieldset は使えない。aria-labelledby で代替 */}
        <div
          role="group"
          aria-labelledby="status-filter-label"
          className="flex flex-wrap items-center gap-2"
        >
          <span
            id="status-filter-label"
            className="text-xs text-muted-foreground"
          >
            ステータス
          </span>
          {FILTERABLE_STATUSES.map((s) => {
            const checked = statusArr?.includes(s) ?? false;
            return (
              <label
                key={s}
                className={cn(
                  "text-xs px-2 py-1 rounded-md border cursor-pointer select-none",
                  checked
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card text-foreground border-border/60 hover:bg-accent",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => toggleStatus(s)}
                />
                {taskStatusLabels[s]}
              </label>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          組織
          <select
            aria-label="組織フィルタ"
            // select の value は effective な状態を反映する。
            // 「すべて」を選んだ後は URL に "all" が入り、select も "all" を選ぶ。
            // 初期表示で URL 未指定かつ currentOrg がある場合はその org を選んだ状態にする。
            value={
              search.orgId === ALL_ORGS_SENTINEL
                ? ALL_ORGS_SENTINEL
                : (search.orgId ?? currentOrgId ?? ALL_ORGS_SENTINEL)
            }
            onChange={(e) =>
              onSearchChange({
                ...search,
                // 「すべて」も含めて常に URL に値を残す。これにより
                // 「明示的にすべて」と「未指定（currentOrg を初期値）」を識別できる。
                orgId: e.target.value,
              })
            }
            className="text-xs px-2 py-1 rounded-md border border-border/60 bg-card text-foreground"
          >
            <option value={ALL_ORGS_SENTINEL}>すべて</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <p>読み込み中...</p>
      ) : isError ? (
        <p className="text-destructive">タスクの取得に失敗しました</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">担当中のタスクはありません</p>
      ) : (
        <ul aria-label="My タスク一覧" className="grid gap-2">
          {filtered.map((task) => (
            <TaskRow key={task.id} task={task} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

// route コンポーネントは search を URL と同期させる薄いラッパー。
// サイドバー選択中の組織を jotai atom から取り出し、初期フィルタとして渡す。
function MyTasksPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const currentOrgId = useAtomValue(currentOrganizationIdAtom);
  return (
    <MyTasksView
      search={search}
      onSearchChange={(next) => navigate({ search: next })}
      currentOrgId={currentOrgId}
    />
  );
}

// タスクの organization 配列から重複を除いた組織候補を作る。
function uniqueOrganizations(
  tasks: TaskListItem[],
): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const t of tasks) {
    if (!seen.has(t.organization.id)) {
      seen.set(t.organization.id, t.organization.name);
    }
  }
  return Array.from(seen, ([id, name]) => ({ id, name }));
}
