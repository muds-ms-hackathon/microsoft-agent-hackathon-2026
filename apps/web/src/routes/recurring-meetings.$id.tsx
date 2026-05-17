import { CreateMeetingDialog } from "@/features/recurring-meetings/components/CreateMeetingDialog";
import { MeetingCard } from "@/features/recurring-meetings/components/MeetingCard";
import { useRecurringMeetingDetail } from "@/features/recurring-meetings/hooks/useRecurringMeetingDetail";
import { useRecurringMeetingMeetings } from "@/features/recurring-meetings/hooks/useRecurringMeetingMeetings";
import { partitionMeetings } from "@/features/recurring-meetings/meetingSections";
import {
  describeCron,
  parseCron,
} from "@/features/recurring-meetings/scheduleCron";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/recurring-meetings/$id")({
  component: RecurringMeetingDetailPage,
});

function RecurringMeetingDetailPage() {
  const { id } = Route.useParams();
  return <RecurringMeetingDetailView id={id} />;
}

// route コンポーネントから分離したビュー。テストでは props で id を渡して直接 render する
// （既存 OrganizationDetailView と同じ流儀）。
// now はセクション分け用の現在時刻。本番では未指定（new Date() が使われる）、
// テストでは固定値を渡すことで TanStack Query の内部処理と fake timer が
// 衝突するのを避ける。
export function RecurringMeetingDetailView({
  id,
  now,
}: {
  id: string;
  now?: Date;
}) {
  const detailQuery = useRecurringMeetingDetail(id);
  const meetingsQuery = useRecurringMeetingMeetings(id);

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
    </section>
  );
}
