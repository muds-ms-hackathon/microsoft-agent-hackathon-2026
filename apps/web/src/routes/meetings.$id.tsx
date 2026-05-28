import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMeetingDetail } from "@/features/meetings/hooks/useMeetingDetail";
import {
  REVIEW_ITEM_TYPES,
  TYPE_BADGE_CLASS,
  TYPE_LABELS,
  type ReviewItem,
} from "@/features/review/types";
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
import { useMeetingTasks } from "@/features/tasks/hooks/useMeetingTasks";
import { taskQueryKeys } from "@/features/tasks/queryKeys";
import { taskStatusLabels } from "@/features/tasks/labels";
import type { TaskListFilters, TaskStatus } from "@/features/tasks/types";
import { authAtom } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

// 手動経路で表示する status の選択肢。AI 専用の draft/reviewing は UI から除外。
const FILTERABLE_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "done",
  "rejected",
];

const meetingSearchSchema = z.object({
  status: z.string().optional(),
  view: z.enum(["list", "kanban"]).optional(),
  // 「期限超過のみ」クイックトグル。API 仕様と整合させるため "true" 文字列で永続化する。
  overdueOnly: z.string().optional(),
  // 担当者フィルタ。値は userId / "none"（未アサイン）/ undefined（すべて）の 3 系統。
  assigneeId: z.string().optional(),
});

type MeetingSearch = z.infer<typeof meetingSearchSchema>;

export const Route = createFileRoute("/meetings/$id")({
  validateSearch: meetingSearchSchema,
  component: MeetingDetailPage,
});

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

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MeetingDetailPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <MeetingDetailView
      id={id}
      search={search}
      onSearchChange={(next) => navigate({ search: next })}
    />
  );
}

// route コンポーネントから分離したビュー。テストでは props で id を渡して直接 render する
// （既存 RecurringMeetingDetailView と同じ流儀）。
export function MeetingDetailView({
  id,
  search = {},
  onSearchChange = () => {},
  now,
}: {
  id: string;
  search?: MeetingSearch;
  onSearchChange?: (next: MeetingSearch) => void;
  now?: Date;
}) {
  const detailQuery = useMeetingDetail(id);
  const {
    items: meetingReviewItems,
    isError: reviewItemsError,
    resetToPending,
  } = useReviewItems({ meetingId: id, status: "all" });
  const pendingCount = meetingReviewItems.filter(
    (i) => i.status === "draft" || i.status === "reviewing",
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
  const tasksQuery = useMeetingTasks(id, filtersForQuery);

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
        <p>会議の取得に失敗しました</p>
      </div>
    );
  }

  const detail = detailQuery.data;

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
      aria-labelledby="meeting-title"
      className="container mx-auto p-8 space-y-6"
    >
      <header className="space-y-2">
        <Link
          to="/recurring-meetings/$id"
          params={{ id: detail.recurringMeeting.id }}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {detail.recurringMeeting.name} に戻る
        </Link>
        <h1 id="meeting-title" className="text-2xl font-bold">
          {detail.title}
        </h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{formatDateTime(detail.heldAt)}</span>
          {detail.estimatedDurationMinutes !== null && (
            <span>{detail.estimatedDurationMinutes} 分</span>
          )}
        </div>
      </header>

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
            {/* この会議由来として origin を伝播し、紐付け先の定例も初期 attach する。 */}
            <CreateTaskDialog
              organizationId={detail.organization.id}
              recurringMeetingId={detail.recurringMeeting.id}
              originMeetingId={detail.id}
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
            orgId={detail.organization.id}
            value={search.assigneeId}
            onChange={(next) => onSearchChange({ ...search, assigneeId: next })}
            currentUserEmail={currentUserEmail}
          />

          {/* Kanban view では列ヘッダで status が可視化されているため、
              フィルタ UI と二重化しないようブロックごと非表示にする。 */}
          {!isKanbanView && (
            // status フィルタ。My タスク・定例詳細と同じ inline label + aria-labelledby パターン。
            // biome の useSemanticElements は fieldset を勧めるが、legend のレイアウト崩れを
            // 避けるため div + role=group で代替する。
            // biome-ignore lint/a11y/useSemanticElements: legend が要素を改行させるため fieldset は使えない。aria-labelledby で代替
            <div
              role="group"
              aria-labelledby="meeting-task-status-filter-label"
              className="flex flex-wrap items-center gap-2"
            >
              <span
                id="meeting-task-status-filter-label"
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
            この会議から発生したタスクはまだありません
          </p>
        ) : search.view === "kanban" ? (
          <KanbanBoard
            tasks={tasksQuery.data ?? []}
            queryKey={taskQueryKeys.meeting(id, filtersForQuery ?? {})}
            ariaLabel="会議由来のタスク Kanban"
            now={now}
          />
        ) : (
          <TaskListWithDialogs
            tasks={tasksQuery.data ?? []}
            ariaLabel="会議由来のタスク一覧"
            now={now}
          />
        )}
      </section>

      {/* AI抽出結果セクション（読み取り専用・アコーディオン） */}
      <section aria-label="AI抽出結果" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">AI抽出結果</h2>
          {pendingCount > 0 ? (
            <Link
              to="/review"
              search={{
                recurringMeetingId: detail.recurringMeeting.id,
                meetingId: id,
                from: "hub",
              }}
            >
              <Button size="sm" className="gap-1">
                レビューして確定する（{pendingCount}件）
                <ChevronRight size={14} />
              </Button>
            </Link>
          ) : meetingReviewItems.length > 0 ? (
            <Link
              to="/review"
              search={{
                recurringMeetingId: detail.recurringMeeting.id,
                meetingId: id,
                from: "hub",
              }}
            >
              <Button size="sm" variant="outline" className="gap-1">
                確定済み（レビュー内容を見る）
                <ChevronRight size={14} />
              </Button>
            </Link>
          ) : null}
        </div>
        {reviewItemsError ? (
          <p className="text-sm text-destructive">
            AI抽出結果の取得に失敗しました
          </p>
        ) : meetingReviewItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            AI抽出結果はまだありません
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {REVIEW_ITEM_TYPES.map((type) => {
              const typeItems = meetingReviewItems.filter(
                (i) => i.type === type,
              );
              if (typeItems.length === 0) return null;
              return (
                <ReviewAccordionItem
                  key={type}
                  type={type}
                  items={typeItems}
                  onResetToPending={resetToPending}
                />
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function ResolutionBadge({
  type,
  status,
  resolutionType,
}: {
  type: (typeof REVIEW_ITEM_TYPES)[number];
  status: ReviewItem["status"];
  resolutionType: ReviewItem["resolutionType"];
}) {
  if (status === "draft" || status === "reviewing") return null;
  if (status === "rejected" || status === "cancelled") {
    return (
      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
        却下
      </span>
    );
  }
  let label: string;
  if (type === "ambiguity") {
    label =
      resolutionType === "task"
        ? "→タスク登録済み"
        : resolutionType === "decision_item"
          ? "→未決事項に変換"
          : resolutionType === "discarded"
            ? "→破棄"
            : "→解消済み";
  } else if (type === "task_candidate") {
    label = "タスク登録済み";
  } else if (type === "open_issue") {
    label = "決定済み";
  } else {
    label = "確定済み";
  }
  return (
    <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">
      {label}
    </span>
  );
}

// AI抽出結果アコーディオン（読み取り専用）
function ReviewAccordionItem({
  type,
  items,
  onResetToPending,
}: {
  type: (typeof REVIEW_ITEM_TYPES)[number];
  items: ReviewItem[];
  onResetToPending?: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const pendingCount = items.filter(
    (i) => i.status === "draft" || i.status === "reviewing",
  ).length;

  const handleResetToPending = async (id: string) => {
    setResetError(null);
    try {
      await onResetToPending?.(id);
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "更新に失敗しました");
    }
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-medium px-2 py-0.5 rounded-full",
              TYPE_BADGE_CLASS[type],
            )}
          >
            {TYPE_LABELS[type]}
          </span>
          <span className="text-muted-foreground text-xs">
            {items.length}件
            {pendingCount > 0 && (
              <span className="ml-1 text-orange-500">
                （未確定 {pendingCount}件）
              </span>
            )}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={cn(
            "text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <>
          {resetError && (
            <p className="px-4 py-2 text-xs text-destructive border-t">
              {resetError}
            </p>
          )}
          <ul className="border-t divide-y">
            {items.map((item) => {
              const isPending =
                item.status === "draft" || item.status === "reviewing";
              const canReset =
                !isPending && item.sourceTable !== "ambiguous_info";
              return (
                <li key={item.id} className="px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm">{item.title}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <ResolutionBadge
                        type={type}
                        status={item.status}
                        resolutionType={item.resolutionType}
                      />
                      {canReset && onResetToPending && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                              aria-label="メニュー"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-xs"
                              onClick={() => handleResetToPending(item.id)}
                            >
                              レビュー待ちに戻す
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                  {item.sourceContext && (
                    <p className="text-xs text-amber-900 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                      {item.sourceContext}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
