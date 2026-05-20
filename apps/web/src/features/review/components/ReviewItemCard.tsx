import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOrganizationMembers } from "@/features/organizations/hooks/useOrganizationMembers";
import { AssigneeDropdown } from "@/features/tasks/components/AssigneeDropdown";
import { useCreateTask } from "@/features/tasks/hooks/useCreateTask";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { ReviewItem } from "../types";
import { TYPE_BADGE_CLASS, TYPE_LABELS } from "../types";

// "YYYY-MM-DD" → ISO8601 UTC 00:00
function toIsoDate(date: string): string | undefined {
  if (!date) return undefined;
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

export function ReviewItemCard({
  item,
  onUpdate,
  orgId = null,
}: {
  item: ReviewItem;
  onUpdate: (id: string, updates: Partial<Omit<ReviewItem, "id">>) => void;
  orgId?: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(item.content);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(item.assigneeIds);
  const [deadline, setDeadline] = useState(item.deadline ?? "");

  // 通常表示での担当者名解決用
  const { data: members = [] } = useOrganizationMembers(orgId);
  const assigneeNames = members
    .filter((m) => item.assigneeIds.includes(m.userId))
    .map((m) => m.displayName);

  const createTask = useCreateTask();
  const isCreating = createTask.isPending;

  const createTaskAndConfirm = () => {
    if (!orgId) return;
    createTask.mutate(
      {
        organizationId: orgId,
        title: item.content,
        body: item.sourceContext || undefined,
        assigneeUserIds: assigneeIds.length > 0 ? assigneeIds : undefined,
        dueDate: toIsoDate(deadline),
        recurringMeetingIds: [item.recurringMeetingId],
        originMeetingId: item.meetingId,
      },
      {
        onSuccess: () => {
          onUpdate(item.id, {
            status: "confirmed",
            content: item.content,
            assigneeIds,
            deadline: deadline || null,
          });
        },
      },
    );
  };

  const handleDecide = () => {
    onUpdate(item.id, {
      status: "confirmed",
      type: "decision",
      assigneeIds,
      deadline: deadline || null,
    });
  };

  const handleSaveEdit = () => {
    if (item.type === "task_candidate") {
      // タスク候補は内容・担当者・期限だけ保存し、登録は通常モードのボタンで行う
      onUpdate(item.id, {
        content: editContent,
        assigneeIds,
        deadline: deadline || null,
      });
    } else {
      onUpdate(item.id, {
        status: "confirmed",
        content: editContent,
        ...(item.type === "open_issue" ? { type: "decision" as const } : {}),
        assigneeIds,
        deadline: deadline || null,
      });
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditContent(item.content);
    setAssigneeIds(item.assigneeIds);
    setDeadline(item.deadline ?? "");
    setIsEditing(false);
  };

  const primaryLabel =
    item.type === "open_issue"
      ? "決定"
      : item.type === "task_candidate"
        ? "タスクとして登録"
        : "承認";

  const saveEditLabel =
    item.type === "open_issue"
      ? "保存して決定"
      : "保存";

  const primaryDisabled =
    item.type === "task_candidate" ? isCreating || !orgId : false;

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
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={2}
              className="text-sm"
            />
          ) : (
            <p className="text-sm font-medium">{item.content}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {item.recurringMeetingName}
            {item.meetingLabel && item.meetingLabel !== item.meetingId
              ? ` ${item.meetingLabel}`
              : ""}
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
                  value={assigneeIds}
                  onChange={setAssigneeIds}
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
          (assigneeNames.length > 0 || item.deadline) && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {assigneeNames.length > 0 && (
                <span>担当: {assigneeNames.join(", ")}</span>
              )}
              {item.deadline && <span>期限: {item.deadline}</span>}
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
                disabled={isCreating || !orgId}
                onClick={() => createTaskAndConfirm()}
              >
                {isCreating ? "登録中..." : "タスクにする"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() =>
                  onUpdate(item.id, { type: "open_issue", status: "pending" })
                }
              >
                未決事項にする
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs text-destructive hover:text-destructive"
                onClick={() => onUpdate(item.id, { status: "rejected" })}
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
              disabled={isCreating}
              onClick={handleSaveEdit}
            >
              {isCreating ? "登録中..." : saveEditLabel}
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
              onClick={
                item.type === "open_issue"
                  ? handleDecide
                  : item.type === "task_candidate"
                    ? () => createTaskAndConfirm()
                    : () =>
                        onUpdate(item.id, {
                          status: "confirmed",
                          assigneeIds,
                          deadline: deadline || null,
                        })
              }
            >
              {isCreating ? "登録中..." : primaryLabel}
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
              onClick={() => onUpdate(item.id, { status: "rejected" })}
            >
              却下
            </Button>
          </div>
        )}

        {createTask.isError && (
          <p className="text-xs text-destructive">タスクの作成に失敗しました</p>
        )}
      </CardContent>
    </Card>
  );
}
