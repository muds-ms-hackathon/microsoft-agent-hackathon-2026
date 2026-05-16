import type { RecurringMeeting } from "@/features/organizations/types";
import type { ReactNode } from "react";

// 作成日表示。日本ロケールで「2026/5/16」のように短く出す。
// 時刻まで含めると一覧で冗長になるため日付のみ。
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP");
}

export function RecurringMeetingCard({
  meeting,
  actions,
}: {
  meeting: RecurringMeeting;
  // 編集・削除ボタン等を右肩に差し込むためのスロット。
  // 各操作の責務はカード本体に持たせず、呼び出し側で組み立てる。
  actions?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-md border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-medium truncate">{meeting.name}</span>
          {meeting.description ? (
            <span className="text-sm text-muted-foreground line-clamp-2">
              {meeting.description}
            </span>
          ) : null}
        </div>
        {actions ? (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-mono">{meeting.scheduleCron}</span>
        <span>{meeting.defaultDurationMinutes} 分</span>
        <span>作成: {formatDate(meeting.createdAt)}</span>
      </div>
    </li>
  );
}
