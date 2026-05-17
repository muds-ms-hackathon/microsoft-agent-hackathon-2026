import { ambiguityTypeLabels } from "@/features/tasks/labels";
import type { Task } from "@/features/tasks/types";

// AI 由来の read-only フィールドが「1 つでも値を持っているか」を判定する。
// すべて null / 空配列 / 0 の場合はセクション自体を非表示にする方針。
function hasAnyAiField(task: Task): boolean {
  if (task.sourceQuote) return true;
  if (task.sourceContext) return true;
  if (task.dueDateRaw) return true;
  if (task.dueDateEstimated) return true;
  if (task.assigneeRaw) return true;
  if (task.ambiguityFlags && task.ambiguityFlags.length > 0) return true;
  if (task.carriedOverCount && task.carriedOverCount > 0) return true;
  if (task.progressNote) return true;
  return false;
}

// AI が抽出時に付けた根拠情報を read-only で表示するセクション。
// 値がない項目は行ごと非表示にして、ノイズを減らす。
export function TaskAiReadOnlySection({ task }: { task: Task }) {
  if (!hasAnyAiField(task)) return null;

  return (
    <details className="rounded-md border border-border/40 bg-muted/30">
      <summary className="px-3 py-2 cursor-pointer text-sm text-muted-foreground">
        AI 抽出情報（読み取り専用）
      </summary>
      <dl className="px-3 pb-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        {task.sourceQuote && (
          <>
            <dt className="text-muted-foreground">根拠発話</dt>
            <dd>{task.sourceQuote}</dd>
          </>
        )}
        {task.sourceContext && (
          <>
            <dt className="text-muted-foreground">前後の文脈</dt>
            <dd className="whitespace-pre-wrap">{task.sourceContext}</dd>
          </>
        )}
        {task.dueDateRaw && (
          <>
            <dt className="text-muted-foreground">期限（原文）</dt>
            <dd>
              {task.dueDateRaw}
              {task.dueDateEstimated ? "（推定）" : null}
            </dd>
          </>
        )}
        {task.assigneeRaw && (
          <>
            <dt className="text-muted-foreground">担当者（原文）</dt>
            <dd>{task.assigneeRaw}</dd>
          </>
        )}
        {task.ambiguityFlags && task.ambiguityFlags.length > 0 && (
          <>
            <dt className="text-muted-foreground">曖昧フラグ</dt>
            <dd className="flex flex-wrap gap-1">
              {task.ambiguityFlags.map((f) => (
                <span
                  key={f}
                  className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  {ambiguityTypeLabels[f] ?? f}
                </span>
              ))}
            </dd>
          </>
        )}
        {task.carriedOverCount && task.carriedOverCount > 0 && (
          <>
            <dt className="text-muted-foreground">持ち越し回数</dt>
            <dd>{task.carriedOverCount}</dd>
          </>
        )}
        {task.progressNote && (
          <>
            <dt className="text-muted-foreground">進捗メモ</dt>
            <dd className="whitespace-pre-wrap">{task.progressNote}</dd>
          </>
        )}
      </dl>
    </details>
  );
}
