import { cn } from "@/lib/utils";

// 担当者アバターのスタック表示。タスク一覧の「誰が担当か」を視覚化する。
// 最大件数を超えると "+N" バッジで省略表現する。

// 表示用ユーザーの最小型。TaskListItem / Task の assignee と互換。
export type AvatarUser = {
  id: string;
  displayName: string;
};

// イニシャル 1 文字を取り出す。サロゲートペア（絵文字等）を 1 文字として扱うため
// Array.from で分割してから先頭を取る。
function initial(name: string | null | undefined): string {
  if (!name) return "?";
  const chars = Array.from(name.trim());
  return chars[0] ?? "?";
}

// userId をハッシュして安定的に色パレットから 1 色を選ぶ。
// 同じユーザーは常に同じ色のアバターになり、視覚的な識別性が増す。
const PALETTE = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-fuchsia-500",
] as const;

function hashColor(id: string): string {
  // 単純な文字コード合計の mod。MVP では衝突しても見た目以外の影響なし。
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum = (sum + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(sum) % PALETTE.length];
}

export function AvatarStack({
  users,
  max = 4,
  size = "sm",
  extraCount = 0,
}: {
  users: AvatarUser[];
  max?: number;
  size?: "sm" | "md";
  // API 側で件数を絞って渡す場合に、実際の残り人数を上書きするための補正値。
  extraCount?: number;
}) {
  if (users.length === 0) {
    return <span className="text-xs text-muted-foreground">担当者未指定</span>;
  }

  const shown = users.slice(0, max);
  const remaining = users.length - shown.length + extraCount;
  const sizeClass = size === "sm" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-xs";

  return (
    // biome-ignore lint/a11y/useSemanticElements: fieldset の legend がレイアウト崩れを起こすため div + role=group で代替（プロジェクト方針）
    <div
      role="group"
      aria-label={`担当者: ${users.map((u) => u.displayName).join(", ")}`}
      className="flex -space-x-1.5"
      data-testid="task-assignee-avatars"
    >
      {shown.map((u) => (
        <span
          key={u.id}
          title={u.displayName}
          className={cn(
            "inline-flex items-center justify-center rounded-full font-semibold text-white ring-2 ring-card",
            sizeClass,
            hashColor(u.id),
          )}
        >
          {initial(u.displayName)}
        </span>
      ))}
      {remaining > 0 && (
        <span
          title={`他 ${remaining} 名`}
          className={cn(
            "inline-flex items-center justify-center rounded-full font-semibold text-muted-foreground bg-muted ring-2 ring-card",
            sizeClass,
          )}
        >
          +{remaining}
        </span>
      )}
    </div>
  );
}
