import { Button } from "@/components/ui/button";
import { AddReviewItemDialog } from "@/features/review/components/AddReviewItemDialog";
import { ReviewItemCard } from "@/features/review/components/ReviewItemCard";
import {
  REVIEWABLE_TYPES,
  TYPE_LABELS,
  type ReviewItem,
  type ReviewItemType,
} from "@/features/review/types";
import { useReviewItems } from "@/features/review/useReviewItems";
import { useRecurringMeetingDetail } from "@/features/recurring-meetings/hooks/useRecurringMeetingDetail";
import { useOrganizationMeetings } from "@/features/recurring-meetings/hooks/useOrganizationMeetings";
import { currentOrganizationIdAtom } from "@/lib/currentOrganization";
import { cn } from "@/lib/utils";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { z } from "zod";

// ===== ルート定義 =====

const reviewSearchSchema = z.object({
  recurringMeetingId: z.string().optional(),
  meetingId: z.string().optional(),
  type: z.string().optional(),
});

type ReviewSearch = z.infer<typeof reviewSearchSchema>;

export const Route = createFileRoute("/review")({
  validateSearch: reviewSearchSchema,
  component: ReviewPage,
});

// ===== ユーティリティ =====

function parseTypeParam(raw: string | undefined): ReviewItemType[] | undefined {
  if (!raw) return undefined;
  const arr = raw
    .split(",")
    .map((v) => v.trim())
    .filter((v): v is ReviewItemType =>
      REVIEWABLE_TYPES.includes(v as ReviewItemType),
    );
  return arr.length > 0 ? arr : undefined;
}

// ===== ReviewView =====

export function ReviewView({
  search,
  onSearchChange,
  currentOrgId = null,
  items,
  onAddItem,
  onUpdate,
}: {
  search: ReviewSearch;
  onSearchChange: (next: ReviewSearch) => void;
  currentOrgId?: string | null;
  items: ReviewItem[];
  onAddItem: (draft: Omit<ReviewItem, "id" | "status">) => void;
  onUpdate: (id: string, updates: Partial<Omit<ReviewItem, "id">>) => void;
}) {
  const typeArr = parseTypeParam(search.type);
  const selectedRmId = search.recurringMeetingId;

  // 定例名の表示用（定例経由で開いた場合）
  const rmDetailQuery = useRecurringMeetingDetail(selectedRmId ?? "");
  const rmName = rmDetailQuery.data?.name ?? null;

  // サイドバー経由（recurringMeetingId なし）のとき定例一覧を表示
  const { data: recurringMeetings = [] } = useOrganizationMeetings(
    selectedRmId ? null : currentOrgId,
  );

  const toggleType = (t: ReviewItemType) => {
    const current = new Set(typeArr ?? []);
    if (current.has(t)) current.delete(t);
    else current.add(t);
    const next = Array.from(current);
    onSearchChange({
      ...search,
      type: next.length > 0 ? next.join(",") : undefined,
    });
  };

  // URLパラメータで絞り込んだ対象アイテム（pending・非決定事項）
  const filtered = items.filter((item) => {
    if (item.status !== "pending") return false;
    if (item.type === "decision") return false;
    if (selectedRmId && item.recurringMeetingId !== selectedRmId) return false;
    if (search.meetingId && item.meetingId !== search.meetingId) return false;
    if (typeArr && !typeArr.includes(item.type)) return false;
    return true;
  });

  // 対象スコープ内の全アイテム（確定済み含む、決定事項除く）
  const scopedItems = items.filter((item) => {
    if (item.type === "decision") return false;
    if (selectedRmId && item.recurringMeetingId !== selectedRmId) return false;
    if (search.meetingId && item.meetingId !== search.meetingId) return false;
    return true;
  });

  const isCompleted = scopedItems.length > 0 && filtered.length === 0;

  return (
    <section
      aria-labelledby="review-title"
      className="container mx-auto p-8 space-y-6"
    >
      <header className="space-y-1">
        {selectedRmId && (
          <Link
            to="/recurring-meetings/$id"
            params={{ id: selectedRmId }}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {rmName ?? "定例ハブ"}に戻る
          </Link>
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 id="review-title" className="text-2xl font-bold">
              レビュー
            </h1>
            <p className="text-sm text-muted-foreground">
              AIが抽出した結果を確認・確定します
            </p>
          </div>
          {currentOrgId && (
            <AddReviewItemDialog
              orgId={currentOrgId}
              onAdd={onAddItem}
              initialRmId={selectedRmId}
              initialMeetingId={search.meetingId}
            />
          )}
        </div>
      </header>

      {/* 定例フィルタ（サイドバー経由のときのみ表示） */}
      {!selectedRmId && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          定例
          <select
            aria-label="定例フィルタ"
            value={search.recurringMeetingId ?? "all"}
            onChange={(e) =>
              onSearchChange({
                ...search,
                recurringMeetingId:
                  e.target.value === "all" ? undefined : e.target.value,
                meetingId: undefined,
              })
            }
            className="text-xs px-2 py-1 rounded-md border border-border/60 bg-card text-foreground"
          >
            <option value="all">すべて</option>
            {recurringMeetings.map((rm) => (
              <option key={rm.id} value={rm.id}>
                {rm.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* 種別フィルタ */}
      {/* biome-ignore lint/a11y/useSemanticElements: legend が要素を改行させるため fieldset は使えない。aria-labelledby で代替 */}
      <div
        role="group"
        aria-labelledby="type-filter-label"
        className="flex flex-wrap items-center gap-2"
      >
        <span id="type-filter-label" className="text-xs text-muted-foreground">
          種別
        </span>
        {REVIEWABLE_TYPES.map((t) => {
          const checked = typeArr?.includes(t) ?? false;
          return (
            <label
              key={t}
              className={cn(
                "text-xs px-2 py-1 rounded-md border cursor-pointer select-none",
                checked
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-foreground border-border/60 hover:bg-accent",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => toggleType(t)}
              />
              {TYPE_LABELS[t]}
            </label>
          );
        })}
      </div>

      {currentOrgId === null ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed py-20">
          <p className="text-muted-foreground">
            サイドバーから組織を選択してください
          </p>
        </div>
      ) : isCompleted ? (
        // レビュー完了状態
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 gap-4">
          <p className="text-sm font-medium">レビューが完了しました</p>
          {selectedRmId && (
            <Link to="/recurring-meetings/$id" params={{ id: selectedRmId }}>
              <Button size="sm">定例ハブに戻る</Button>
            </Link>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed py-16">
          <p className="text-sm text-muted-foreground">
            レビュー待ちのアイテムはありません
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((item) => (
            <ReviewItemCard
              key={item.id}
              item={item}
              onUpdate={onUpdate}
              orgId={currentOrgId}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ===== ReviewPage =====

function ReviewPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const currentOrgId = useAtomValue(currentOrganizationIdAtom);
  const { items, addItem, updateItem } = useReviewItems();

  return (
    <ReviewView
      search={search}
      onSearchChange={(next) => navigate({ search: next })}
      currentOrgId={currentOrgId}
      items={items}
      onAddItem={addItem}
      onUpdate={updateItem}
    />
  );
}
