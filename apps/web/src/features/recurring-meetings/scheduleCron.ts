// 定例の開催頻度を表す UI 上の中間表現。
// ビルダー UI 側はこの形を編集し、API 送信時に buildCron で cron 文字列へ変換する。
// 編集ダイアログでは既存 cron 文字列を parseCron でこの形に逆引きする。
export type CronBuilderState = {
  frequency: "daily" | "weekly" | "monthly";
  // 0=日, 1=月, ..., 6=土。frequency==="weekly" のときのみ参照。
  weekdays: number[];
  // 1〜31。frequency==="monthly" のときのみ参照。
  dayOfMonth: number;
  // 0〜23
  hour: number;
  // 0〜59
  minute: number;
};

// ビルダーの初期状態。「毎週月曜 10:00」を既定にする（議事プロダクトでの想定が多い時刻帯）。
export const defaultCronBuilderState: CronBuilderState = {
  frequency: "weekly",
  weekdays: [1],
  dayOfMonth: 1,
  hour: 10,
  minute: 0,
};

export function buildCron(state: CronBuilderState): string {
  const { frequency, weekdays, dayOfMonth, hour, minute } = state;
  if (frequency === "daily") {
    return `${minute} ${hour} * * *`;
  }
  if (frequency === "weekly") {
    // 曜日未選択は cron 上「全曜日」と同義 (毎日) になってしまうため、
    // ビルダー側で送信を抑制する責務を持つ。ここでは "*" を返さず、
    // 空配列ならば fall-through で 0 (日曜) として送る安全側のデフォルトとしておく。
    const days = weekdays.length === 0 ? "0" : [...weekdays].sort().join(",");
    return `${minute} ${hour} * * ${days}`;
  }
  return `${minute} ${hour} ${dayOfMonth} * *`;
}

function parseIntStrict(s: string): number | null {
  if (!/^\d+$/.test(s)) return null;
  return Number.parseInt(s, 10);
}

// 既存 cron 文字列をビルダー状態に変換する。
// 表現できない cron（例: 範囲指定 "1-5"、ステップ指定 "*/15"、月指定など）は null を返し、
// 呼び出し側でカスタム入力フォールバックに切り替えてもらう想定。
export function parseCron(cron: string): CronBuilderState | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minStr, hourStr, domStr, monthStr, dowStr] = fields;
  const minute = parseIntStrict(minStr);
  const hour = parseIntStrict(hourStr);
  if (minute === null || hour === null) return null;
  if (minute < 0 || minute > 59) return null;
  if (hour < 0 || hour > 23) return null;
  // 月指定は本ビルダーではサポートしない（毎月実行のみ）。
  if (monthStr !== "*") return null;

  const domIsWild = domStr === "*";
  const dowIsWild = dowStr === "*";

  if (domIsWild && dowIsWild) {
    return {
      frequency: "daily",
      weekdays: [],
      dayOfMonth: 1,
      hour,
      minute,
    };
  }
  if (domIsWild && !dowIsWild) {
    // weekly: 0-6 のカンマ区切り
    const parts = dowStr.split(",").map(parseIntStrict);
    if (parts.some((d) => d === null || d < 0 || d > 6)) return null;
    return {
      frequency: "weekly",
      weekdays: parts as number[],
      dayOfMonth: 1,
      hour,
      minute,
    };
  }
  if (!domIsWild && dowIsWild) {
    const day = parseIntStrict(domStr);
    if (day === null || day < 1 || day > 31) return null;
    return {
      frequency: "monthly",
      weekdays: [],
      dayOfMonth: day,
      hour,
      minute,
    };
  }
  // dom と dow の両方指定はビルダー UI では扱わない。
  return null;
}

const WEEKDAY_LABELS_JA = ["日", "月", "火", "水", "木", "金", "土"];

function formatTime(hour: number, minute: number): string {
  const h = hour.toString().padStart(2, "0");
  const m = minute.toString().padStart(2, "0");
  return `${h}:${m}`;
}

// プレビュー欄に表示する人間向け表記。
// 例: 「毎週 月・水 10:00」「毎月 1 日 09:00」「毎日 10:00」。
export function describeCron(state: CronBuilderState): string {
  const time = formatTime(state.hour, state.minute);
  if (state.frequency === "daily") {
    return `毎日 ${time}`;
  }
  if (state.frequency === "weekly") {
    if (state.weekdays.length === 0) {
      return `毎週（曜日未選択） ${time}`;
    }
    const labels = [...state.weekdays]
      .sort()
      .map((d) => WEEKDAY_LABELS_JA[d])
      .join("・");
    return `毎週 ${labels} ${time}`;
  }
  return `毎月 ${state.dayOfMonth} 日 ${time}`;
}
