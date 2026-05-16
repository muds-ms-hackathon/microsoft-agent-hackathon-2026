import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useId, useState } from "react";
import {
  buildCron,
  type CronBuilderState,
  defaultCronBuilderState,
  describeCron,
  parseCron,
} from "../scheduleCron";

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
  { value: 0, label: "日" },
];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

// 開催頻度のビルダー UI。
// React Hook Form と組み合わせるときは Controller でラップし、`value` に現在の cron 文字列を、
// `onChange` に「次の cron 文字列」を返す。生 cron を直接知る必要があるレビュアーや
// 開発者向けに、プレビュー欄に cron 表記も併記する。
export function ScheduleCronBuilder({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (cron: string) => void;
  error?: string;
}) {
  // value が既存 cron として復元できない場合（範囲指定など）は既定状態にフォールバック。
  // 編集ダイアログ等で未対応 cron を受け取ったケースは呼び出し側でカスタム入力へ切り替える想定。
  const [state, setState] = useState<CronBuilderState>(
    () => parseCron(value) ?? defaultCronBuilderState,
  );
  const dayId = useId();
  const timeId = useId();

  const update = (next: CronBuilderState) => {
    setState(next);
    onChange(buildCron(next));
  };

  const updateTime = (time: string) => {
    // HTML time input は "HH:MM" 形式。空 (クリア) も来うる。
    const [h, m] = time.split(":").map((s) => Number.parseInt(s, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    update({ ...state, hour: h, minute: m });
  };

  const toggleWeekday = (d: number) => {
    const next = state.weekdays.includes(d)
      ? state.weekdays.filter((x) => x !== d)
      : [...state.weekdays, d];
    update({ ...state, weekdays: next });
  };

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">頻度</legend>
        <div className="flex gap-2" role="radiogroup" aria-label="頻度">
          {(["daily", "weekly", "monthly"] as const).map((f) => {
            const active = state.frequency === f;
            const label =
              f === "daily" ? "毎日" : f === "weekly" ? "毎週" : "毎月";
            return (
              <Button
                key={f}
                type="button"
                variant={active ? "default" : "outline"}
                size="sm"
                role="radio"
                aria-checked={active}
                onClick={() => update({ ...state, frequency: f })}
              >
                {label}
              </Button>
            );
          })}
        </div>
      </fieldset>

      {state.frequency === "weekly" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">曜日（複数選択可）</legend>
          <div className="flex gap-1 flex-wrap">
            {WEEKDAYS.map(({ value: d, label }) => {
              const active = state.weekdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={active}
                  aria-label={label}
                  onClick={() => toggleWeekday(d)}
                  className={cn(
                    "h-8 w-9 rounded-md border text-sm transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground/70 hover:bg-accent",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {state.frequency === "monthly" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={dayId}>日</Label>
          <select
            id={dayId}
            value={state.dayOfMonth}
            onChange={(e) =>
              update({ ...state, dayOfMonth: Number(e.target.value) })
            }
            className="border rounded-md p-2 bg-background w-24"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d} 日
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={timeId}>時刻</Label>
        <input
          id={timeId}
          type="time"
          value={`${pad(state.hour)}:${pad(state.minute)}`}
          onChange={(e) => updateTime(e.target.value)}
          className="border rounded-md p-2 bg-background w-32"
        />
      </div>

      <div
        role="status"
        aria-label="開催頻度プレビュー"
        className="rounded-md bg-muted/40 px-3 py-2 text-sm"
      >
        <span className="font-medium">{describeCron(state)}</span>
        <span className="ml-2 font-mono text-xs text-muted-foreground">
          ({buildCron(state)})
        </span>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
