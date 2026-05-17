import type { MeetingListItem } from "../hooks/useRecurringMeetingMeetings";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  // ロケール表示で「2026/5/20 10:00」のように出す。
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 個別 Meeting を表示するカード。タイトル / 開催日時 / 所要時間の最小情報を出す。
// 議事録メタや話者などの詳細は将来の Meeting 詳細ページで提供する想定。
export function MeetingCard({ meeting }: { meeting: MeetingListItem }) {
  return (
    <li className="flex flex-col gap-1 rounded-md border bg-card p-4 shadow-sm">
      <span className="font-medium truncate">{meeting.title}</span>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatDateTime(meeting.heldAt)}</span>
        {meeting.estimatedDurationMinutes !== null && (
          <span>{meeting.estimatedDurationMinutes} 分</span>
        )}
      </div>
    </li>
  );
}
