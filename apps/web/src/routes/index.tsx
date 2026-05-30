import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganizationMeetings } from "@/features/recurring-meetings/hooks/useOrganizationMeetings";
import {
  type MeetingListItem,
  meetingListQueryOptions,
} from "@/features/recurring-meetings/hooks/useRecurringMeetingMeetings";
import { partitionMeetings } from "@/features/recurring-meetings/meetingSections";
import { TYPE_LABELS, type ReviewItemType } from "@/features/review/types";
import { useReviewItems } from "@/features/review/useReviewItems";
import { useMarkTaskRead } from "@/features/tasks/hooks/useMarkTaskRead";
import { useMyTasks } from "@/features/tasks/hooks/useMyTasks";
import type { TaskListFilters } from "@/features/tasks/types";
import {
  URGENCY_STYLE,
  calcUrgency,
  formatDeadline,
  summarizeReminders,
} from "@/features/tasks/urgency";
import { currentOrganizationIdAtom } from "@/lib/currentOrganization";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import {
  AvatarStack,
  type AvatarUser,
} from "@/features/tasks/components/AvatarStack";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  ChevronRight,
  Clock,
} from "lucide-react";

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
  members,
  memberCount,
}: {
  recurringMeetingId: string;
  recurringMeetingName: string;
  next: MeetingListItem;
  members: AvatarUser[];
  memberCount: number;
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
        <div className="flex items-center justify-between mt-1">
          {memberCount > 0 && (
            <AvatarStack
              users={members}
              size="sm"
              extraCount={memberCount - members.length}
            />
          )}
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
  members: AvatarUser[];
  memberCount: number;
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
        members: rm.members.map((m) => ({
          id: m.user.id,
          displayName: m.user.displayName || m.user.name,
        })),
        memberCount: rm._count.members,
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
            members={c.members}
            memberCount={c.memberCount}
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
  const { items, isLoading, isError, refetch } = useReviewItems({
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
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <p className="text-sm text-destructive">取得に失敗しました</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              再試行
            </button>
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

// ===== リマインド集約バナー =====

// 未完了タスクの取得フィルタ。バナーとカードで同一キーを使い fetch を共有する。
const INCOMPLETE_SEARCH_FILTER: TaskListFilters = {
  status: ["todo", "in_progress"],
};

// /tasks 一覧への遷移に使う共通フィルタ（未完了タスクに絞る）。
const INCOMPLETE_SEARCH = { status: "todo,in_progress" } as const;

// バナーに表示する各カテゴリの定義。
// 期限超過のみ既存の overdueOnly フィルタへ正確に遷移し、
// 今週期限・着手予定日超過・未読は専用フィルタUIが無いため未完了一覧へ遷移する。
const REMINDER_ITEMS = [
  {
    key: "overdue" as const,
    label: "期限超過",
    Icon: AlertTriangle,
    className: "text-destructive border-destructive/30 bg-destructive/5",
    search: { ...INCOMPLETE_SEARCH, overdueOnly: "true" },
  },
  {
    key: "dueSoon" as const,
    label: "今週期限",
    Icon: Clock,
    className: "text-amber-600 border-amber-500/30 bg-amber-500/5",
    search: INCOMPLETE_SEARCH,
  },
  {
    key: "startOverdue" as const,
    label: "着手予定日超過",
    Icon: CalendarClock,
    className: "text-orange-600 border-orange-500/30 bg-orange-500/5",
    search: INCOMPLETE_SEARCH,
  },
  {
    key: "unread" as const,
    label: "未読",
    Icon: Bell,
    className: "text-sky-600 border-sky-500/30 bg-sky-500/5",
    search: INCOMPLETE_SEARCH,
  },
];

// 期限超過・今週期限・着手予定日超過・未読を件数付きで集約表示するバナー。
// 見落とし防止が目的のため、件数 0 のカテゴリは出さず、全て 0 なら非表示にする。
function RemindersBanner() {
  const {
    data = [],
    isLoading,
    isError,
  } = useMyTasks(INCOMPLETE_SEARCH_FILTER);

  if (isLoading || isError) return null;

  const summary = summarizeReminders(data);
  const visible = REMINDER_ITEMS.filter((item) => summary[item.key] > 0);
  if (visible.length === 0) return null;

  return (
    <div
      role="status"
      aria-label="リマインド"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-3"
    >
      <span className="text-xs font-semibold text-muted-foreground shrink-0">
        リマインド
      </span>
      {visible.map(({ key, label, Icon, className, search }) => (
        <Link
          key={key}
          to="/tasks"
          search={search}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:brightness-95 ${className}`}
        >
          <Icon size={13} />
          <span>{label}</span>
          <span className="font-semibold">{summary[key]}</span>
          <span>件</span>
        </Link>
      ))}
    </div>
  );
}

// ===== 未完了タスクカード =====

function IncompleteTasksCard() {
  const markRead = useMarkTaskRead();
  const {
    data = [],
    isLoading,
    isError,
    refetch,
  } = useMyTasks(INCOMPLETE_SEARCH_FILTER);

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
          search={{ status: "todo,in_progress" }}
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
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <p className="text-sm text-destructive">
              タスクの取得に失敗しました
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              再試行
            </button>
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              未完了のタスクはありません
            </p>
          </div>
        ) : (
          data.map((task) => {
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
                  {task.unread && (
                    <button
                      type="button"
                      // クリックで既読化する最小導線。pending 中は二重送信を防ぐ。
                      onClick={() => markRead.mutate(task.id)}
                      disabled={markRead.isPending}
                      title="クリックで既読にする"
                      className="shrink-0 inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-600 transition-colors hover:bg-sky-500/20 disabled:opacity-50"
                    >
                      <Bell size={11} />
                      未読
                    </button>
                  )}
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
          {/* 最上段：未達・期限超過・未読のリマインド集約バナー */}
          <RemindersBanner />

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
