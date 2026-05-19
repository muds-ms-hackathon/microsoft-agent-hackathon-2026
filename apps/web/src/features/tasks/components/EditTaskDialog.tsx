import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { taskQueryKeys } from "@/features/tasks/queryKeys";
import {
  TaskVersionConflictError,
  useUpdateTask,
} from "@/features/tasks/hooks/useUpdateTask";
import { taskPriorityLabels, taskStatusLabels } from "@/features/tasks/labels";
import type { ManualTaskStatus, Task } from "@/features/tasks/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { AssigneePicker } from "./AssigneePicker";
import { RecurringMeetingPicker } from "./RecurringMeetingPicker";
import { TaskAiReadOnlySection } from "./TaskAiReadOnlySection";

// 編集フォームのスキーマ。日付・選択肢が未指定の場合は空文字を許容し、
// 送信時に元の値と diff を取って変更フィールドのみ API に送る。
const editTaskFormSchema = z.object({
  title: z.string().min(1, "タイトルは必須です"),
  body: z.string(),
  status: z.enum(["todo", "in_progress", "done", "rejected"]),
  priority: z.enum(["", "required", "optional"]),
  dueDate: z.string(),
  startDate: z.string(),
  followUpDate: z.string(),
  recurringMeetingIds: z.array(z.string()),
  assigneeUserIds: z.array(z.string()),
});

type EditTaskFormValues = z.infer<typeof editTaskFormSchema>;

// 編集画面の手動 status は 4 値のみ表示する。draft / reviewing は AI 専用なので除外。
const MANUAL_STATUSES: ManualTaskStatus[] = [
  "todo",
  "in_progress",
  "done",
  "rejected",
];

// ISO datetime "YYYY-MM-DDTHH:mm:ss.sssZ" を <input type="date"> の "YYYY-MM-DD" に変換する。
// null は空文字に倒し、フォームで「未指定」を表現する。
function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

// <input type="date"> の "YYYY-MM-DD" を UTC 00:00 の ISO datetime に変換する。
// 空文字は null（クリア意図）として送る。
function dateInputToIsoOrNull(date: string): string | null {
  if (!date) return null;
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

// 配列の内容が同一かを順不同で比較する。
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

// task から RHF の defaultValues を組み立てる。useEffect の依存に乗らないよう、
// コンポーネント外の純粋関数として定義する。
function buildDefaults(t: Task): EditTaskFormValues {
  return {
    title: t.title,
    body: t.body ?? "",
    // 手動 4 値以外（AI 用の draft/reviewing）は UI 上 todo にフォールバック。
    // 編集時にユーザーがそのまま保存しても draft/reviewing を維持しないのは仕様。
    status: MANUAL_STATUSES.includes(t.status as ManualTaskStatus)
      ? (t.status as ManualTaskStatus)
      : "todo",
    priority: t.priority ?? "",
    dueDate: isoToDateInput(t.dueDate),
    startDate: isoToDateInput(t.startDate),
    followUpDate: isoToDateInput(t.followUpDate),
    recurringMeetingIds: t.recurringMeetings.map((r) => r.id),
    assigneeUserIds: t.assignees.map((a) => a.id),
  };
}

export function EditTaskDialog({
  task,
  trigger,
  open: openProp,
  onOpenChange,
  onRequestDelete,
}: {
  task: Task;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // 削除ボタンを押したときの動線。親が DeleteTaskDialog を制御する想定。
  onRequestDelete?: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };

  const titleId = useId();
  const bodyId = useId();
  const statusId = useId();
  const priorityId = useId();
  const dueDateId = useId();
  const startDateId = useId();
  const followUpDateId = useId();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<EditTaskFormValues>({
    resolver: zodResolver(editTaskFormSchema),
    defaultValues: buildDefaults(task),
  });

  // 親から新しい task が渡ってきたとき、閉じている間にフォームを再同期する。
  useEffect(() => {
    if (!open) reset(buildDefaults(task));
  }, [task, open, reset]);

  const mutation = useUpdateTask(task.id);
  const queryClient = useQueryClient();
  const isVersionConflict = mutation.error instanceof TaskVersionConflictError;

  const onSubmit = (data: EditTaskFormValues) => {
    // 変更があったフィールドのみを送る。空文字 / null の判定は API 仕様
    // （nullable な日付は null で送るとクリア）に合わせる。
    const json: Parameters<typeof mutation.mutate>[0] = {
      version: task.version,
    };
    if (data.title !== task.title) json.title = data.title;
    if (data.body !== (task.body ?? "")) json.body = data.body;
    if (data.status !== task.status) json.status = data.status;
    const prevPriority = task.priority ?? "";
    if (data.priority !== prevPriority) {
      json.priority = data.priority || undefined;
    }
    const nextDue = dateInputToIsoOrNull(data.dueDate);
    if (nextDue !== task.dueDate) json.dueDate = nextDue;
    const nextStart = dateInputToIsoOrNull(data.startDate);
    if (nextStart !== task.startDate) json.startDate = nextStart;
    const nextFollowUp = dateInputToIsoOrNull(data.followUpDate);
    if (nextFollowUp !== task.followUpDate) json.followUpDate = nextFollowUp;

    const prevRmIds = task.recurringMeetings.map((r) => r.id);
    if (!sameSet(data.recurringMeetingIds, prevRmIds)) {
      json.recurringMeetingIds = data.recurringMeetingIds;
    }
    const prevAssignees = task.assignees.map((a) => a.id);
    if (!sameSet(data.assigneeUserIds, prevAssignees)) {
      json.assigneeUserIds = data.assigneeUserIds;
    }

    mutation.mutate(json, {
      onSuccess: () => {
        setOpen(false);
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) mutation.reset();
      }}
    >
      {trigger !== undefined ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>タスクを編集</DialogTitle>
          <DialogDescription>
            タスクの情報を更新します。最新で保存されていないと 409 になります。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor={titleId}>タイトル</Label>
            <Input id={titleId} {...register("title")} />
            {errors.title && (
              <p role="alert" className="text-destructive text-sm">
                {errors.title.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={bodyId}>本文</Label>
            <Input id={bodyId} {...register("body")} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={statusId}>ステータス</Label>
              <select
                id={statusId}
                {...register("status")}
                className="text-sm px-2 py-1.5 rounded-md border border-border/60 bg-card"
              >
                {MANUAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {taskStatusLabels[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={priorityId}>必須度</Label>
              <select
                id={priorityId}
                {...register("priority")}
                className="text-sm px-2 py-1.5 rounded-md border border-border/60 bg-card"
              >
                <option value="">未指定</option>
                <option value="required">{taskPriorityLabels.required}</option>
                <option value="optional">{taskPriorityLabels.optional}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={dueDateId}>期限</Label>
              <Input id={dueDateId} type="date" {...register("dueDate")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={startDateId}>開始日</Label>
              <Input id={startDateId} type="date" {...register("startDate")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={followUpDateId}>再検討日</Label>
              <Input
                id={followUpDateId}
                type="date"
                {...register("followUpDate")}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>紐付ける定例</Label>
            <Controller
              name="recurringMeetingIds"
              control={control}
              render={({ field }) => (
                <RecurringMeetingPicker
                  organizationId={task.organizationId}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>担当者</Label>
            <Controller
              name="assigneeUserIds"
              control={control}
              render={({ field }) => (
                <AssigneePicker
                  organizationId={task.organizationId}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          <TaskAiReadOnlySection task={task} />

          {isVersionConflict ? (
            // 楽観的ロック競合。最新を取得してフォームを巻き戻す導線を出す。
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="text-destructive">
                他のユーザーが先に更新しました。最新を取得して再試行してください。
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  // detail と一覧の両方を invalidate して親で refetch させる。
                  queryClient.invalidateQueries({
                    queryKey: taskQueryKeys.detail(task.id),
                  });
                  queryClient.invalidateQueries({
                    queryKey: taskQueryKeys.all,
                  });
                  mutation.reset();
                }}
              >
                最新を取得
              </Button>
            </div>
          ) : mutation.isError ? (
            <p className="text-destructive text-sm">
              タスクの更新に失敗しました
            </p>
          ) : null}

          <DialogFooter className="sm:justify-between">
            {onRequestDelete ? (
              <Button
                type="button"
                variant="destructive"
                onClick={onRequestDelete}
              >
                削除
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={mutation.isPending}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
