import { Button } from "@/components/ui/button";
import { SectionError } from "@/components/ui/SectionError";
import { ReviewItemCard } from "@/features/review/components/ReviewItemCard";
import {
  REVIEWABLE_TYPES,
  TYPE_LABELS,
  type ReviewItem,
  type ReviewItemType,
} from "@/features/review/types";
import {
  useReviewItems,
  type AmbiguityResolution,
} from "@/features/review/useReviewItems";
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
  // 定例ハブ・会議詳細から遷移した場合は "hub"。サイドバー経由は undefined。
  from: z.enum(["hub"]).optional(),
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
  isLoading = false,
  isError = false,
  refetch,
  onUpdate,
  onResolveAmbiguity,
  rmName = null,
  recurringMeetings = [],
}: {
  search: ReviewSearch;
  onSearchChange: (next: ReviewSearch) => void;
  currentOrgId?: string | null;
  items: ReviewItem[];
  isLoading?: boolean;
  isError?: boolean;
  refetch?: () => void;
  onUpdate: (
    id: string,
    updates: Partial<Omit<ReviewItem, "id">>,
  ) => Promise<void>;
  onResolveAmbiguity: (
    id: string,
    params: AmbiguityResolution,
  ) => Promise<void>;
  rmName?: string | null;
  recurringMeetings?: { id: string; name: string }[];
}) {
  const typeArr = parseTypeParam(search.type);
  const selectedRmId = search.recurringMeetingId;
  // 定例ハブ・会議詳細から遷移した場合のみ true
  const fromHub = search.from === "hub";

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

  const filtered = items.filter((item) => {
    if (selectedRmId && item.recurringMeetingId !== selectedRmId) return false;
    if (search.meetingId && item.meetingId !== search.meetingId) return false;
    if (typeArr && !typeArr.includes(item.type)) return false;
    return true;
  });

  const scopedItems = items.filter((item) => {
    if (selectedRmId && item.recurringMeetingId !== selectedRmId) return false;
    if (search.meetingId && item.meetingId !== search.meetingId) return false;
    return true;
  });

  // API がデフォルトで pending のみを返すため、スコープ指定あり・ロード完了・0件 = レビュー完了
  const isCompleted =
    !isLoading &&
    (!!selectedRmId || !!search.meetingId) &&
    scopedItems.length === 0;

  return (
    <section
      aria-labelledby="review-title"
      className="container mx-auto p-8 space-y-6"
    >
      <header className="space-y-1">
        {fromHub && selectedRmId && (
          <Link
            to="/recurring-meetings/$id"
            params={{ id: selectedRmId }}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {rmName ?? "定例ハブ"}に戻る
          </Link>
        )}
        <div>
          <h1 id="review-title" className="text-2xl font-bold">
            レビュー
          </h1>
          <p className="text-sm text-muted-foreground">
            AIが抽出した結果を確認・確定します
          </p>
        </div>
      </header>

      {/* 定例フィルタ（サイドバー経由のときは定例選択後も常に表示） */}
      {!fromHub && (
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
      ) : isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-dashed py-20">
          <p className="text-muted-foreground">読み込み中...</p>
        </div>
      ) : isError ? (
        <SectionError
          message="レビューアイテムの取得に失敗しました"
          onRetry={refetch ?? undefined}
        />
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
              onResolveAmbiguity={onResolveAmbiguity}
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
  const fromHub = search.from === "hub";

  const { items, isLoading, isError, refetch, updateItem, resolveAmbiguity } =
    useReviewItems({
      meetingId: search.meetingId,
      recurringMeetingId: search.recurringMeetingId,
      // 定例・会議いずれも未指定（全表示）の場合は組織全体から取得する
      organizationId:
        !search.meetingId && !search.recurringMeetingId && currentOrgId
          ? currentOrgId
          : undefined,
    });

  const rmDetailQuery = useRecurringMeetingDetail(
    search.recurringMeetingId ?? "",
  );
  const rmName = rmDetailQuery.data?.name ?? null;

  const { data: recurringMeetings = [] } = useOrganizationMeetings(
    fromHub ? null : currentOrgId,
  );

  return (
    <ReviewView
      search={search}
      onSearchChange={(next) => navigate({ search: next })}
      currentOrgId={currentOrgId}
      items={items}
      isLoading={isLoading}
      isError={isError}
      refetch={refetch}
      onUpdate={updateItem}
      onResolveAmbiguity={resolveAmbiguity}
      rmName={rmName}
      recurringMeetings={recurringMeetings}
    />
  );
}
