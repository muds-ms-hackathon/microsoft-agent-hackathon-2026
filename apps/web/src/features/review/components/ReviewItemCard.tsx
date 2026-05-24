import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOrganizationMembers } from "@/features/organizations/hooks/useOrganizationMembers";
import { useRecurringMeetingDetail } from "@/features/recurring-meetings/hooks/useRecurringMeetingDetail";
import { AssigneeDropdown } from "@/features/tasks/components/AssigneeDropdown";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { ReviewAssignee, ReviewItem } from "../types";
import { TYPE_BADGE_CLASS, TYPE_LABELS } from "../types";
import type { AmbiguityResolution } from "../useReviewItems";

// "YYYY-MM-DD" → ISO8601 UTC 00:00
function toIsoDate(date: string): string | undefined {
  if (!date) return undefined;
  return `${date}T00:00:00.000Z`;
}

// ISO8601 または "YYYY-MM-DD" → date input 用の "YYYY-MM-DD"
function deadlineToInputValue(deadline: string | null): string {
  if (!deadline) return "";
  return deadline.slice(0, 10);
}

export function ReviewItemCard({
  item,
  onUpdate,
  onResolveAmbiguity,
  orgId = null,
}: {
  item: ReviewItem;
  onUpdate: (id: string, updates: Partial<Omit<ReviewItem, "id">>) => Promise<void>;
  onResolveAmbiguity: (id: string, params: AmbiguityResolution) => Promise<void>;
  orgId?: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>(
    item.assignees.map((a) => a.id),
  );
  const [deadline, setDeadline] = useState(deadlineToInputValue(item.deadline));
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // 定例名の表示用。ReviewView が同じキーを先にフェッチしていればキャッシュから即返る。
  const { data: rmDetail } = useRecurringMeetingDetail(item.recurringMeetingId);
  const recurringMeetingName = rmDetail?.name ?? null;

  // 編集保存時に ID → ReviewAssignee へ変換するために使用
  const { data: members = [] } = useOrganizationMembers(orgId);

  const assigneeDisplayNames = item.assignees.map((a) => a.displayName);

  const buildAssignees = (): ReviewAssignee[] =>
    selectedAssigneeIds.flatMap((id) => {
      const m = members.find((m) => m.userId === id);
      return m
        ? [{ id: m.userId, name: m.name, displayName: m.displayName, email: m.email }]
        : [];
    });

  const callAmbiguity = async (params: AmbiguityResolution) => {
    setUpdateError(null);
    setIsUpdating(true);
    try {
      await onResolveAmbiguity(item.id, params);
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setIsUpdating(false);
    }
  };

  const callUpdate = async (updates: Partial<Omit<ReviewItem, "id">>) => {
    setUpdateError(null);
    setIsUpdating(true);
    try {
      await onUpdate(item.id, updates);
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (item.type === "task_candidate") {
      // タスク候補は内容・担当者・期限だけ保存し、登録は通常モードのボタンで行う
      await callUpdate({
        title: editTitle,
        assignees: buildAssignees(),
        deadline: deadline || null,
      });
    } else if (item.type === "open_issue") {
      await callUpdate({
        title: editTitle,
        assignees: buildAssignees(),
        deadline: deadline || null,
      });
    } else {
      await callUpdate({
        status: "decided",
        title: editTitle,
        assignees: buildAssignees(),
        deadline: deadline || null,
      });
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditTitle(item.title);
    setSelectedAssigneeIds(item.assignees.map((a) => a.id));
    setDeadline(deadlineToInputValue(item.deadline));
    setIsEditing(false);
  };

  const primaryLabel =
    item.type === "task_candidate" ? "タスクとして登録" : "承認";

  const saveEditLabel = "保存";

  const primaryDisabled =
    item.type === "task_candidate" ? isUpdating || !orgId : isUpdating;

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        {/* 種別バッジ + 内容 */}
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className={cn(
              "inline-flex self-start text-xs font-medium px-2 py-0.5 rounded-full",
              TYPE_BADGE_CLASS[item.type],
            )}
          >
            {TYPE_LABELS[item.type]}
          </span>
          {isEditing ? (
            <Textarea
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              rows={2}
              className="text-sm"
            />
          ) : (
            <p className="text-sm font-medium">{item.title}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {recurringMeetingName ?? item.recurringMeetingId}
          </p>
        </div>

        {/* 根拠発話・文脈 */}
        {(item.sourceQuote || item.sourceContext) && (
          <div className="flex flex-col gap-1">
            {item.sourceQuote && (
              <p className="text-xs bg-amber-50 text-amber-900 px-3 py-2 rounded-md border border-amber-100 italic">
                「{item.sourceQuote}」
              </p>
            )}
            {item.sourceContext && !item.sourceQuote && (
              <p className="text-xs bg-amber-50 text-amber-900 px-3 py-2 rounded-md border border-amber-100">
                {item.sourceContext}
              </p>
            )}
            {item.sourceContext && item.sourceQuote && (
              <p className="text-xs text-muted-foreground px-1">
                {item.sourceContext}
              </p>
            )}
          </div>
        )}

        {/* 重要度（曖昧箇所のみ） */}
        {item.type === "ambiguity" && item.severity && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">重要度</span>
            <span
              className={cn(
                "text-xs font-medium px-1.5 py-0.5 rounded",
                item.severity === "high"
                  ? "bg-red-100 text-red-700"
                  : item.severity === "medium"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-gray-100 text-gray-600",
              )}
            >
              {item.severity === "high"
                ? "高"
                : item.severity === "medium"
                  ? "中"
                  : "低"}
            </span>
          </div>
        )}

        {/* 担当者・期限（修正モードのみ編集可） */}
        {isEditing ? (
          <div className="flex flex-wrap items-center gap-3">
            {orgId ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">担当者</span>
                <AssigneeDropdown
                  organizationId={orgId}
                  value={selectedAssigneeIds}
                  onChange={setSelectedAssigneeIds}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">期限</span>
              <Input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-7 text-xs w-36"
              />
            </div>
          </div>
        ) : (
          /* 通常表示：担当者・期限が設定済みなら小さく表示 */
          (assigneeDisplayNames.length > 0 || item.deadline) && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {assigneeDisplayNames.length > 0 && (
                <span>担当: {assigneeDisplayNames.join(", ")}</span>
              )}
              {item.deadline && (
                <span>期限: {deadlineToInputValue(item.deadline)}</span>
              )}
            </div>
          )
        )}

        {/* アクション */}
        {item.type === "ambiguity" ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">解消先を選択</span>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                disabled={isUpdating}
                onClick={() =>
                  callAmbiguity({
                    resolution: "task",
                    assigneeUserIds: selectedAssigneeIds,
                    dueDate: deadline || null,
                    recurringMeetingIds: [item.recurringMeetingId],
                  })
                }
              >
                {isUpdating ? "処理中..." : "タスクにする"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                disabled={isUpdating}
                onClick={() => callAmbiguity({ resolution: "decision_item" })}
              >
                未決事項にする
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs text-destructive hover:text-destructive"
                disabled={isUpdating}
                onClick={() => callAmbiguity({ resolution: "rejected" })}
              >
                破棄
              </Button>
            </div>
          </div>
        ) : isEditing ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="text-xs"
              disabled={isUpdating}
              onClick={handleSaveEdit}
            >
              {isUpdating ? "保存中..." : saveEditLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={handleCancelEdit}
            >
              キャンセル
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              disabled={primaryDisabled}
              onClick={() =>
                callUpdate({
                  status: "decided",
                  assignees: buildAssignees(),
                  deadline: deadline || null,
                })
              }
            >
              {isUpdating ? "処理中..." : primaryLabel}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => setIsEditing(true)}
            >
              修正
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs text-destructive hover:text-destructive"
              disabled={isUpdating}
              onClick={() => callUpdate({ status: "rejected" })}
            >
              却下
            </Button>
          </div>
        )}

        {updateError && (
          <p className="text-xs text-destructive">{updateError}</p>
        )}
      </CardContent>
    </Card>
  );
}
