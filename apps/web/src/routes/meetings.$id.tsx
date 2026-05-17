import { useMeetingDetail } from "@/features/meetings/hooks/useMeetingDetail";
import { CreateTaskDialog } from "@/features/tasks/components/CreateTaskDialog";
import { TaskListWithDialogs } from "@/features/tasks/components/TaskListWithDialogs";
import { useMeetingTasks } from "@/features/tasks/hooks/useMeetingTasks";
import { taskStatusLabels } from "@/features/tasks/labels";
import type { TaskStatus } from "@/features/tasks/types";
import { cn } from "@/lib/utils";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
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
  const statusArr = parseStatusParam(search.status);
  const tasksQuery = useMeetingTasks(
    id,
    statusArr ? { status: statusArr } : undefined,
  );

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
          {/* この会議由来として origin を伝播し、紐付け先の定例も初期 attach する。 */}
          <CreateTaskDialog
            organizationId={detail.organization.id}
            recurringMeetingId={detail.recurringMeeting.id}
            originMeetingId={detail.id}
          />
        </div>

        {/* status フィルタ。My タスク・定例詳細と同じ inline label + aria-labelledby パターン。
            biome の useSemanticElements は fieldset を勧めるが、legend のレイアウト崩れを
            避けるため div + role=group で代替する。 */}
        {/* biome-ignore lint/a11y/useSemanticElements: legend が要素を改行させるため fieldset は使えない。aria-labelledby で代替 */}
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

        {tasksQuery.isLoading ? (
          <p className="text-muted-foreground">タスクを読み込み中...</p>
        ) : tasksQuery.isError ? (
          <p className="text-destructive text-sm">タスクの取得に失敗しました</p>
        ) : (tasksQuery.data ?? []).length === 0 ? (
          <p className="text-muted-foreground">
            この会議から発生したタスクはまだありません
          </p>
        ) : (
          <TaskListWithDialogs
            tasks={tasksQuery.data ?? []}
            ariaLabel="会議由来のタスク一覧"
            now={now}
          />
        )}
      </section>
    </section>
  );
}
