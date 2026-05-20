import { Button } from "@/components/ui/button";
import { CreateMeetingDialog } from "@/features/recurring-meetings/components/CreateMeetingDialog";
import { MeetingCard } from "@/features/recurring-meetings/components/MeetingCard";
import { useRecurringMeetingDetail } from "@/features/recurring-meetings/hooks/useRecurringMeetingDetail";
import { useRecurringMeetingMeetings } from "@/features/recurring-meetings/hooks/useRecurringMeetingMeetings";
import { partitionMeetings } from "@/features/recurring-meetings/meetingSections";
import {
  describeCron,
  parseCron,
} from "@/features/recurring-meetings/scheduleCron";
import { useReviewItems } from "@/features/review/useReviewItems";
import { AssigneeFilter } from "@/features/tasks/components/AssigneeFilter";
import { CreateTaskDialog } from "@/features/tasks/components/CreateTaskDialog";
import { KanbanBoard } from "@/features/tasks/components/KanbanBoard";
import { OverdueOnlyToggle } from "@/features/tasks/components/OverdueOnlyToggle";
import { TaskListWithDialogs } from "@/features/tasks/components/TaskListWithDialogs";
import {
  ViewToggle,
  type TaskView,
} from "@/features/tasks/components/ViewToggle";
import { useRecurringMeetingTasks } from "@/features/tasks/hooks/useRecurringMeetingTasks";
import { taskStatusLabels } from "@/features/tasks/labels";
import { taskQueryKeys } from "@/features/tasks/queryKeys";
import type { TaskListFilters, TaskStatus } from "@/features/tasks/types";
import { authAtom } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useAtomValue } from "jotai";
import { z } from "zod";

// タスクセクションのフィルタ用 status 選択肢。
// AI 専用の draft / reviewing は UI から除外する（My タスクと同じ方針）。
const FILTERABLE_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "done",
  "rejected",
];

// URL クエリパラメータの形。タスクセクションの status フィルタを永続化する。
const recurringMeetingSearchSchema = z.object({
  status: z.string().optional(),
  view: z.enum(["list", "kanban"]).optional(),
  // 「期限超過のみ」クイックトグル。API 仕様と整合させるため "true" 文字列で永続化する。
  overdueOnly: z.string().optional(),
  // 担当者フィルタ。値は userId / "none"（未アサイン）/ undefined（すべて）の 3 系統。
  assigneeId: z.string().optional(),
});

type RecurringMeetingSearch = z.infer<typeof recurringMeetingSearchSchema>;

export const Route = createFileRoute("/recurring-meetings/$id")({
  validateSearch: recurringMeetingSearchSchema,
  component: RecurringMeetingDetailPage,
});

// URL の status 文字列を TaskStatus 配列にパースする（My タスクと同じロジック）。
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

function RecurringMeetingDetailPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <RecurringMeetingDetailView
      id={id}
      search={search}
      onSearchChange={(next) => navigate({ search: next })}
    />
  );
}

// route コンポーネントから分離したビュー。テストでは props で id を渡して直接 render する
// （既存 OrganizationDetailView と同じ流儀）。
// now はセクション分け用の現在時刻。本番では未指定（new Date() が使われる）、
// テストでは固定値を渡すことで TanStack Query の内部処理と fake timer が
// 衝突するのを避ける。
export function RecurringMeetingDetailView({
  id,
  search = {},
  onSearchChange = () => {},
  now,
}: {
  id: string;
  search?: RecurringMeetingSearch;
  onSearchChange?: (next: RecurringMeetingSearch) => void;
  now?: Date;
}) {
  const detailQuery = useRecurringMeetingDetail(id);
  const meetingsQuery = useRecurringMeetingMeetings(id);

  const { items: allReviewItems } = useReviewItems();
  const pendingReviewCount = allReviewItems.filter(
    (item) => item.recurringMeetingId === id && item.status === "pending",
  ).length;

  const statusArr = parseStatusParam(search.status);
  // Kanban view では status は列として可視化されるため、フィルタ UI も API への
  // status 絞り込みも外す（全件取得）。URL の `?status=...` 自体は List に戻したときの
  // 復元用に保持する。
  const isKanbanView = search.view === "kanban";
  // 「期限超過のみ」トグル。Kanban view でも有効（列との情報重複なし）。
  const overdueOnly = search.overdueOnly === "true";

  const apiFilters: TaskListFilters = {};
  if (!isKanbanView && statusArr) apiFilters.status = statusArr;
  if (overdueOnly) apiFilters.overdueOnly = true;
  // 担当者フィルタ。"none"（未アサイン）も API センチネルとして素通しする。
  if (search.assigneeId) apiFilters.assigneeId = search.assigneeId;
  const filtersForQuery: TaskListFilters | undefined =
    Object.keys(apiFilters).length > 0 ? apiFilters : undefined;
  const tasksQuery = useRecurringMeetingTasks(id, filtersForQuery);

  // 「自分のみ」option を出すために認証ユーザーの email を取り出す。
  // API 側で JWT の sub は externalId として扱われ DB の user.id とは別物のため、
  // 「自分」の userId は組織メンバー一覧から email 一致で引き当てる方式にしている。
  const auth = useAtomValue(authAtom);
  const currentUserEmail = auth.user?.email ?? null;

  if (detailQuery.isLoading) {
    return (
      <div className="container mx-auto p-8">
        <p>読み込み中...</p>
      </div>
    );
  }
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="container mx-auto p-8">
        <p>定例の取得に失敗しました</p>
      </div>
    );
  }

  const detail = detailQuery.data;
  // scheduleCron をビルダーで復元できるなら人間表記。範囲指定など未対応 cron は
  // 生 cron をフォールバックとして表示する。
  const cronState = parseCron(detail.scheduleCron);
  const cronLabel = cronState ? describeCron(cronState) : detail.scheduleCron;

  const meetings = meetingsQuery.data ?? [];
  const { upcoming, past } = partitionMeetings(meetings, now);

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
      aria-labelledby="recurring-meeting-title"
      className="container mx-auto p-8 space-y-6"
    >
      <header className="space-y-2">
        <Link
          to="/organizations/$id"
          params={{ id: detail.organizationId }}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← 組織詳細に戻る
        </Link>
        <h1 id="recurring-meeting-title" className="text-2xl font-bold">
          {detail.name}
        </h1>
        {detail.description ? (
          <p className="text-muted-foreground">{detail.description}</p>
        ) : null}
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{cronLabel}</span>
          <span>デフォルト {detail.defaultDurationMinutes} 分</span>
        </div>
      </header>

      {/* レビュー待ちセクション（あれば最優先表示） */}
      {pendingReviewCount > 0 && (
        <section
          aria-label="レビュー待ち"
          className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3"
        >
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-orange-900">
              レビュー待ち {pendingReviewCount}件
            </p>
            <p className="text-xs text-orange-700">
              AIが抽出した結果を確認・確定してください
            </p>
          </div>
          <Link to="/review" search={{ recurringMeetingId: id }}>
            <Button
              size="sm"
              className="gap-1 bg-orange-600 hover:bg-orange-700 text-white border-0"
            >
              レビューする
              <ChevronRight size={14} />
            </Button>
          </Link>
        </section>
      )}

      {meetingsQuery.isError ? (
        // 会議取得だけ失敗したケース。定例ヘッダは見せ続けたいので分離して表示。
        <p className="text-destructive text-sm">会議一覧の取得に失敗しました</p>
      ) : (
        <>
          <section aria-label="今後の会議" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">今後の会議</h2>
              <CreateMeetingDialog
                recurringMeetingId={detail.id}
                defaultDurationMinutes={detail.defaultDurationMinutes}
              />
            </div>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground">予定はまだありません</p>
            ) : (
              <ul aria-label="今後の会議一覧" className="grid gap-3">
                {upcoming.map((m) => (
                  <MeetingCard key={m.id} meeting={m} />
                ))}
              </ul>
            )}
          </section>

          <section aria-label="過去の会議" className="space-y-3">
            <h2 className="text-lg font-semibold">過去の会議</h2>
            {past.length === 0 ? (
              <p className="text-muted-foreground">
                過去の開催はまだありません
              </p>
            ) : (
              <ul aria-label="過去の会議一覧" className="grid gap-3">
                {past.map((m) => (
                  <MeetingCard key={m.id} meeting={m} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <section aria-label="タスク" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">タスク</h2>
          <div className="flex items-center gap-2">
            <ViewToggle
              view={(search.view ?? "list") as TaskView}
              onChange={(next) =>
                onSearchChange({
                  ...search,
                  view: next === "list" ? undefined : next,
                })
              }
            />
            {/* タスク作成ダイアログ (#169) で実装したものを起動する。
                現定例を初期 attach する。originMeetingId は会議詳細ページ側で扱う。 */}
            <CreateTaskDialog
              organizationId={detail.organizationId}
              recurringMeetingId={detail.id}
            />
          </div>
        </div>

        {/* フィルタ行。「期限超過のみ」「担当者」は両 view で表示、status フィルタは List view のみ。 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <OverdueOnlyToggle
            value={overdueOnly}
            onChange={(next) =>
              onSearchChange({
                ...search,
                overdueOnly: next ? "true" : undefined,
              })
            }
          />

          <AssigneeFilter
            orgId={detail.organizationId}
            value={search.assigneeId}
            onChange={(next) => onSearchChange({ ...search, assigneeId: next })}
            currentUserEmail={currentUserEmail}
          />

          {/* Kanban view では列ヘッダで status が可視化されているため、
              フィルタ UI と二重化しないようブロックごと非表示にする。 */}
          {!isKanbanView && (
            // status フィルタ。My タスクと同じ inline label + aria-labelledby パターン。
            // biome の useSemanticElements は fieldset を勧めるが、legend のレイアウト崩れを
            // 避けるため div + role=group で代替する（My タスクと同じ判断）。
            // biome-ignore lint/a11y/useSemanticElements: legend が要素を改行させるため fieldset は使えない。aria-labelledby で代替
            <div
              role="group"
              aria-labelledby="rm-task-status-filter-label"
              className="flex flex-wrap items-center gap-2"
            >
              <span
                id="rm-task-status-filter-label"
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
          )}
        </div>

        {tasksQuery.isLoading ? (
          <p className="text-muted-foreground">タスクを読み込み中...</p>
        ) : tasksQuery.isError ? (
          <p className="text-destructive text-sm">タスクの取得に失敗しました</p>
        ) : (tasksQuery.data ?? []).length === 0 ? (
          <p className="text-muted-foreground">
            このプロジェクトのタスクはまだありません
          </p>
        ) : search.view === "kanban" ? (
          <KanbanBoard
            tasks={tasksQuery.data ?? []}
            queryKey={taskQueryKeys.recurring(id, filtersForQuery ?? {})}
            ariaLabel="プロジェクトのタスク Kanban"
            now={now}
          />
        ) : (
          <TaskListWithDialogs
            tasks={tasksQuery.data ?? []}
            ariaLabel="プロジェクトのタスク一覧"
            now={now}
          />
        )}
      </section>
    </section>
  );
}
