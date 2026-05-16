import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useId } from "react";

// プリセット候補。一般的な定例の所要時間カバー範囲。
// プリセット以外を入れたい場合はカスタム入力欄で 1〜480 分まで指定可。
const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;

// 定例のデフォルト所要時間（分）を入力するピッカー。
// React Hook Form と組み合わせるときは Controller でラップし、
// `value` に number、`onChange` に「次の number」を返す。
// API 側 schema と同じ範囲（1〜480 分）を許容する。
export function DurationMinutesPicker({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (next: number) => void;
  error?: string;
}) {
  const inputId = useId();

  const handleCustomChange = (raw: string) => {
    if (raw === "") return;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    onChange(parsed);
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">デフォルト所要時間（分）</legend>
      <div
        className="flex gap-2 flex-wrap"
        role="radiogroup"
        aria-label="所要時間プリセット"
      >
        {DURATION_PRESETS.map((preset) => {
          const active = value === preset;
          return (
            <Button
              key={preset}
              type="button"
              variant={active ? "default" : "outline"}
              size="sm"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(preset)}
            >
              {preset} 分
            </Button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor={inputId} className="text-xs text-muted-foreground">
          カスタム（1〜480 分）
        </Label>
        <Input
          id={inputId}
          type="number"
          min={1}
          max={480}
          value={value}
          onChange={(e) => handleCustomChange(e.target.value)}
          className="w-24"
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </fieldset>
  );
}
