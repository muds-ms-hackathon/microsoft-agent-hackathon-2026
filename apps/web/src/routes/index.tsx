import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganizationMeetings } from "@/features/recurring-meetings/hooks/useOrganizationMeetings";
import {
  type MeetingListItem,
  meetingListQueryOptions,
} from "@/features/recurring-meetings/hooks/useRecurringMeetingMeetings";
import { partitionMeetings } from "@/features/recurring-meetings/meetingSections";
import { TYPE_LABELS, type ReviewItemType } from "@/features/review/types";
import { useReviewItems } from "@/features/review/useReviewItems";
import { useMyTasks } from "@/features/tasks/hooks/useMyTasks";
import { currentOrganizationIdAtom } from "@/lib/currentOrganization";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { ArrowRight, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

// ===== 日時フォーマット =====

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

function formatMeetingTime(
  heldAt: string,
  durationMinutes: number | null,
): string {
  const start = new Date(heldAt);
  const month = start.getMonth() + 1;
  const day = start.getDate();
  const weekday = WEEKDAY_JA[start.getDay()];
  const startTime = start.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (durationMinutes) {
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
    const endTime = end.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${month}/${day}(${weekday}) ${startTime}〜${endTime}`;
  }
  return `${month}/${day}(${weekday}) ${startTime}`;
}

// ===== 次回会議カード =====

function NextMeetingCard({
  recurringMeetingId,
  recurringMeetingName,
  next,
}: {
  recurringMeetingId: string;
  recurringMeetingName: string;
  next: MeetingListItem;
}) {
  return (
    <Card className="w-64 shrink-0 snap-start">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium truncate">
          {recurringMeetingName}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatMeetingTime(next.heldAt, next.estimatedDurationMinutes)}
        </p>
        {/* TODO: 参加者一覧 API が実装されたらアバターを表示する */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-1">
            <div className="size-5 rounded-full bg-muted-foreground/20" />
            <div className="size-5 rounded-full bg-muted-foreground/20" />
            <div className="size-5 rounded-full bg-muted-foreground/20" />
          </div>
          <Link
            to="/recurring-meetings/$id"
            params={{ id: recurringMeetingId }}
            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            詳細
            <ChevronRight size={12} />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== 次回会議セクション =====
// 定例ごとに最も直近の upcoming 会議を1件取得し、日付順で横スクロール表示する。

type Candidate = {
  recurringMeetingId: string;
  recurringMeetingName: string;
  next: MeetingListItem;
};

function NextMeetingsSection({ orgId }: { orgId: string }) {
  const {
    data: recurringMeetings = [],
    isLoading: isRmLoading,
    isError: isRmError,
  } = useOrganizationMeetings(orgId);

  const meetingQueries = useQueries({
    queries: recurringMeetings.map((rm) => meetingListQueryOptions(rm.id)),
  });

  const isLoading = isRmLoading || meetingQueries.some((q) => q.isLoading);
  const isMeetingsError = meetingQueries.some((q) => q.isError);

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="定例を読み込み中"
        className="h-32 rounded-xl border bg-muted/30 animate-pulse"
      />
    );
  }
  if (isRmError || isMeetingsError) {
    return <p className="text-sm text-destructive">定例の取得に失敗しました</p>;
  }

  const candidates: Candidate[] = [];
  for (const [i, rm] of recurringMeetings.entries()) {
    const meetings = meetingQueries[i]?.data ?? [];
    const next = partitionMeetings(meetings).upcoming[0];
    if (next) {
      candidates.push({
        recurringMeetingId: rm.id,
        recurringMeetingName: rm.name,
        next,
      });
    }
  }
  candidates.sort(
    (a, b) =>
      new Date(a.next.heldAt).getTime() - new Date(b.next.heldAt).getTime(),
  );

  if (candidates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>次回会議</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-sm text-muted-foreground">
            予定されている会議はありません
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">次回会議</h2>
      <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide">
        {candidates.map((c) => (
          <NextMeetingCard
            key={c.recurringMeetingId}
            recurringMeetingId={c.recurringMeetingId}
            recurringMeetingName={c.recurringMeetingName}
            next={c.next}
          />
        ))}
      </div>
    </div>
  );
}

// ===== レビュー待ちカード =====

const REVIEW_ITEM_TYPE_ORDER: ReviewItemType[] = [
  "task_candidate",
  "open_issue",
  "ambiguity",
  "decision",
];

function ReviewPendingCard({ orgId }: { orgId: string }) {
  const { items, isLoading, isError } = useReviewItems({
    organizationId: orgId,
  });

  const countByType = REVIEW_ITEM_TYPE_ORDER.map((type) => ({
    type,
    label: TYPE_LABELS[type],
    count: items.filter((i) => i.type === type).length,
  })).filter((r) => r.count > 0);

  return (
    <Card className="gap-0 py-0 overflow-hidden h-90">
      <div className="flex items-center gap-2 px-5 py-3.5 bg-muted/40 border-b border-border/50 shrink-0">
        <span className="text-sm font-semibold flex-1">レビュー待ち</span>
        {!isLoading && !isError && (
          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
            {items.length}
          </span>
        )}
        <Link
          to="/review"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight size={15} />
        </Link>
      </div>
      <div className="px-5 py-1 flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 py-2">
            {(["s0", "s1", "s2"] as const).map((k) => (
              <div
                key={k}
                className="h-10 rounded-md bg-muted/50 animate-pulse"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-destructive">取得に失敗しました</p>
          </div>
        ) : countByType.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              レビュー待ちのアイテムはありません
            </p>
          </div>
        ) : (
          countByType.map((row) => (
            <div
              key={row.type}
              className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
            >
              <span className="text-sm">{row.label}</span>
              <span className="size-6 inline-flex items-center justify-center rounded-full bg-destructive/10 text-destructive text-xs font-semibold shrink-0">
                {row.count}
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

// ===== 未完了タスクカード =====

type TaskUrgency = "overdue" | "this-week" | "later";

const URGENCY_STYLE: Record<TaskUrgency, { border: string; deadline: string }> =
  {
    overdue: {
      border: "border-l-destructive",
      deadline: "text-destructive font-medium",
    },
    "this-week": {
      border: "border-l-amber-500",
      deadline: "text-amber-600 font-medium",
    },
    later: {
      border: "border-l-slate-200",
      deadline: "text-muted-foreground",
    },
  };

function calcUrgency(dueDate: string | null): TaskUrgency {
  if (!dueDate) return "later";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  if (due < today) return "overdue";
  const weekLater = new Date(today);
  weekLater.setDate(weekLater.getDate() + 7);
  if (due <= weekLater) return "this-week";
  return "later";
}

function formatDeadline(dueDate: string | null, urgency: TaskUrgency): string {
  if (!dueDate) return "未設定";
  if (urgency === "overdue") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil(
      (today.getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    return `${days}日超過`;
  }
  const d = new Date(dueDate);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function IncompleteTasksCard() {
  const {
    data = [],
    isLoading,
    isError,
  } = useMyTasks({
    status: ["todo", "in_progress"],
  });

  return (
    <Card className="gap-0 py-0 overflow-hidden h-90">
      <div className="flex items-center gap-2 px-5 py-3.5 bg-muted/40 border-b border-border/50 shrink-0">
        <span className="text-sm font-semibold flex-1">未完了タスク</span>
        {!isLoading && !isError && (
          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
            {data.length}
          </span>
        )}
        <Link
          to="/tasks"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowRight size={15} />
        </Link>
      </div>
      <div className="px-5 py-2 flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 py-2">
            {(["s0", "s1", "s2"] as const).map((k) => (
              <div
                key={k}
                className="h-12 rounded-md bg-muted/50 animate-pulse"
              />
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-destructive">
              タスクの取得に失敗しました
            </p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              未完了のタスクはありません
            </p>
          </div>
        ) : (
          data.slice(0, 4).map((task) => {
            const urgency = calcUrgency(task.dueDate);
            const style = URGENCY_STYLE[urgency];
            const meetingName =
              task.recurringMeetings[0]?.name ??
              task.originMeeting?.title ??
              null;
            return (
              <div
                key={task.id}
                className="py-2 border-b border-border/50 last:border-b-0"
              >
                <div
                  className={`flex items-center gap-3 border-l-4 pl-3 py-2.5 ${style.border}`}
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium truncate">
                      {task.title}
                    </span>
                    {meetingName && (
                      <span className="text-xs text-muted-foreground truncate">
                        {meetingName}
                      </span>
                    )}
                  </div>
                  <span className={`text-xs shrink-0 ${style.deadline}`}>
                    {formatDeadline(task.dueDate, urgency)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

// ===== ダッシュボード =====

export function Dashboard() {
  const orgId = useAtomValue(currentOrganizationIdAtom);

  return (
    <section
      aria-labelledby="dashboard-title"
      className="h-full flex flex-col container mx-auto p-8 gap-6"
    >
      <h1 id="dashboard-title" className="text-2xl font-bold shrink-0">
        ダッシュボード
      </h1>

      {orgId === null ? (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed text-center">
          <p className="text-muted-foreground">
            サイドバーから組織を選択してください
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* 上段：次回会議（横スクロール） */}
          <NextMeetingsSection orgId={orgId} />

          {/* 下段：レビュー待ち（左）・未完了タスク（右） */}
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4">
            <ReviewPendingCard orgId={orgId} />
            <IncompleteTasksCard />
          </div>
        </div>
      )}
    </section>
  );
}
