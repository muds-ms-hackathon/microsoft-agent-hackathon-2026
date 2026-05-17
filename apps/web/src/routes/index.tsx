import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganizationMeetings } from "@/features/recurring-meetings/hooks/useOrganizationMeetings";
import {
  type MeetingListItem,
  meetingListQueryOptions,
} from "@/features/recurring-meetings/hooks/useRecurringMeetingMeetings";
import { partitionMeetings } from "@/features/recurring-meetings/meetingSections";
import { currentOrganizationIdAtom } from "@/lib/currentOrganization";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { ChevronRight } from "lucide-react";

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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>次回会議</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground truncate">
          {recurringMeetingName}
        </p>
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
// 全定例の会議を並列取得し、最も直近の upcoming 会議を1件だけ表示する。

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

  // 全定例の会議を並列取得
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

  // 全定例から最も直近の upcoming 会議を1件選ぶ
  const candidates: Candidate[] = [];
  for (let i = 0; i < recurringMeetings.length; i++) {
    const meetings = meetingQueries[i]?.data ?? [];
    const { upcoming } = partitionMeetings(meetings);
    const next = upcoming[0];
    if (next) {
      candidates.push({
        recurringMeetingId: recurringMeetings[i].id,
        recurringMeetingName: recurringMeetings[i].name,
        next,
      });
    }
  }

  // heldAt が最も近いものを選ぶ
  const nearest =
    [...candidates].sort(
      (a, b) =>
        new Date(a.next.heldAt).getTime() - new Date(b.next.heldAt).getTime(),
    )[0] ?? null;

  if (!nearest) {
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
    <NextMeetingCard
      recurringMeetingId={nearest.recurringMeetingId}
      recurringMeetingName={nearest.recurringMeetingName}
      next={nearest.next}
    />
  );
}

// ===== レビュー待ちカード（モック） =====
// TODO: レビュー待ちデータ取得 API が実装されたら実データに置き換える。

type ReviewRow = { label: string; count: number };

const MOCK_REVIEW_ROWS: ReviewRow[] = [
  { label: "担当者なし", count: 1 },
  { label: "期限なし", count: 1 },
  { label: "未決事項", count: 1 },
];

function ReviewPendingCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>レビュー待ち</CardTitle>
          <span className="text-sm text-muted-foreground font-normal">
            {MOCK_REVIEW_ROWS.reduce((sum, r) => sum + r.count, 0)} 件
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-0 divide-y divide-border/80">
        {MOCK_REVIEW_ROWS.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              レビュー待ちのアイテムはありません
            </p>
          </div>
        ) : (
          MOCK_REVIEW_ROWS.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-3"
            >
              <span className="text-sm">{row.label}</span>
              <span className="flex items-center gap-1 text-sm text-destructive font-medium">
                {row.count} 件
                <ChevronRight size={14} />
              </span>
            </div>
          ))
        )}
        <div className="flex justify-end pt-3">
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            レビューする
            <ChevronRight size={14} />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== 未完了タスクカード（モック） =====
// TODO: タスク API が実装されたら実データに置き換える。

type TaskItem = {
  name: string;
  meeting: string;
  deadline: string;
  // "overdue" | "this-week" | "later"
  urgency: "overdue" | "this-week" | "later";
};

const MOCK_TASKS: TaskItem[] = [
  {
    name: "〜の設定",
    meeting: "〜進捗報告",
    deadline: "3日超過",
    urgency: "overdue",
  },
  {
    name: "〜提出",
    meeting: "〜定例会議",
    deadline: "1日超過",
    urgency: "overdue",
  },
  {
    name: "〜の仕様確認",
    meeting: "〜進捗報告",
    deadline: "5/2",
    urgency: "this-week",
  },
  {
    name: "〜提出",
    meeting: "〜定例会議",
    deadline: "5/4",
    urgency: "this-week",
  },
  {
    name: "〜提出",
    meeting: "〜定例会議",
    deadline: "5/4",
    urgency: "this-week",
  },
];

const URGENCY_STYLE: Record<
  TaskItem["urgency"],
  { border: string; deadline: string }
> = {
  overdue: {
    border: "border-l-destructive",
    deadline: "text-destructive font-medium",
  },
  "this-week": {
    border: "border-l-orange-400",
    deadline: "text-orange-500 font-medium",
  },
  later: {
    border: "border-l-border",
    deadline: "text-muted-foreground",
  },
};

function IncompleteTasksCard() {
  return (
    <Card className="flex flex-col h-[470px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>未完了タスク</CardTitle>
          <span className="text-sm text-muted-foreground font-normal">
            {MOCK_TASKS.length} 件
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 overflow-hidden pb-3">
        <div className="flex flex-col flex-1 overflow-y-auto divide-y divide-border/80">
          {MOCK_TASKS.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">
                未完了のタスクはありません
              </p>
            </div>
          ) : (
            MOCK_TASKS.slice(0, 5).map((item, i) => {
              const style = URGENCY_STYLE[item.urgency];
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: モックデータのため index で代替
                <div key={i} className="py-2">
                  <div
                    className={`flex items-center gap-3 border-l-2 pl-3 py-2 rounded-r-md hover:bg-muted/40 transition-colors ${style.border}`}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">
                        {item.name}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {item.meeting}
                      </span>
                    </div>
                    <span className={`text-xs shrink-0 ${style.deadline}`}>
                      {item.deadline}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            全て見る
            <ChevronRight size={14} />
          </button>
        </div>
      </CardContent>
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
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 items-start">
          {/* 左列：次回会議 + レビュー待ち */}
          <div className="flex flex-col gap-4">
            <NextMeetingsSection orgId={orgId} />
            <ReviewPendingCard />
          </div>

          {/* 右列：未完了タスク */}
          <IncompleteTasksCard />
        </div>
      )}
    </section>
  );
}
