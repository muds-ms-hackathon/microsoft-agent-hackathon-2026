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
import { useCreateTask } from "@/features/tasks/hooks/useCreateTask";
import { taskPriorityLabels } from "@/features/tasks/labels";
import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { AssigneePicker } from "./AssigneePicker";
import { RecurringMeetingPicker } from "./RecurringMeetingPicker";

// フォーム入力用 schema。日付は <input type="date"> の "YYYY-MM-DD" を受け取り、
// 送信時に new Date(date).toISOString() で UTC ISO8601 (00:00:00 UTC) に変換する。
// 空文字は「未指定」として扱い、API には送らない。
const createTaskFormSchema = z.object({
  title: z.string().min(1, "タイトルは必須です"),
  body: z.string(),
  priority: z.enum(["", "required", "optional"]),
  dueDate: z.string(),
  startDate: z.string(),
  followUpDate: z.string(),
  recurringMeetingIds: z.array(z.string()),
  assigneeUserIds: z.array(z.string()),
});

type CreateTaskFormValues = z.infer<typeof createTaskFormSchema>;

// "YYYY-MM-DD" 文字列を UTC 00:00 として ISO8601 datetime に変換する。
// 空文字 / undefined はそのまま undefined を返し、API には送らない。
function dateToIsoOrUndefined(date: string): string | undefined {
  if (!date) return undefined;
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

export function CreateTaskDialog({
  organizationId,
  recurringMeetingId,
  originMeetingId,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  organizationId: string;
  // 呼び出し元の文脈で初期紐付けする定例。例: 定例詳細ページからの作成で「現定例」が初期 attach。
  recurringMeetingId?: string;
  // 呼び出し元の文脈で発生源会議が決まっている場合（会議詳細ページからの作成）。
  originMeetingId?: string;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };

  const titleId = useId();
  const bodyId = useId();
  const priorityId = useId();
  const dueDateId = useId();
  const startDateId = useId();
  const followUpDateId = useId();

  const defaultValues: CreateTaskFormValues = {
    title: "",
    body: "",
    priority: "",
    dueDate: "",
    startDate: "",
    followUpDate: "",
    recurringMeetingIds: recurringMeetingId ? [recurringMeetingId] : [],
    assigneeUserIds: [],
  };

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateTaskFormValues>({
    resolver: zodResolver(createTaskFormSchema),
    defaultValues,
  });

  const mutation = useCreateTask();

  const onSubmit = (data: CreateTaskFormValues) => {
    mutation.mutate(
      {
        organizationId,
        title: data.title,
        body: data.body || undefined,
        priority: data.priority || undefined,
        dueDate: dateToIsoOrUndefined(data.dueDate),
        startDate: dateToIsoOrUndefined(data.startDate),
        followUpDate: dateToIsoOrUndefined(data.followUpDate),
        recurringMeetingIds:
          data.recurringMeetingIds.length > 0
            ? data.recurringMeetingIds
            : undefined,
        assigneeUserIds:
          data.assigneeUserIds.length > 0 ? data.assigneeUserIds : undefined,
        originMeetingId,
      },
      {
        onSuccess: () => {
          reset(defaultValues);
          setOpen(false);
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset(defaultValues);
          mutation.reset();
        }
      }}
    >
      {trigger !== undefined ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : openProp === undefined ? (
        <DialogTrigger asChild>
          <Button size="sm">タスクを追加</Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>タスクを作成</DialogTitle>
          <DialogDescription>
            新しいタスクを作成します。組織のメンバーを担当者に指定できます。
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
                  organizationId={organizationId}
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
                  organizationId={organizationId}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          {mutation.isError && (
            <p className="text-destructive text-sm">
              タスクの作成に失敗しました
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              作成
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
