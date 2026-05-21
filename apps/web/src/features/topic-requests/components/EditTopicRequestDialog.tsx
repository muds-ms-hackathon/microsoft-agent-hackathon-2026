import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateTopicRequest } from "@/features/topic-requests/hooks/useUpdateTopicRequest";
import { topicRequestPriorityLabels } from "@/features/topic-requests/labels";
import type { TopicRequest } from "@/features/topic-requests/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const formSchema = z.object({
  title: z.string().min(1, "タイトルは必須です"),
  body: z.string(),
  priority: z.enum(["", "required", "optional"]),
});

type FormValues = z.infer<typeof formSchema>;

// 既存議題 → フォーム表現への変換。null は空文字 / "" に丸める。
function toFormValues(topicRequest: TopicRequest): FormValues {
  return {
    title: topicRequest.title,
    body: topicRequest.body ?? "",
    priority: topicRequest.priority ?? "",
  };
}

export function EditTopicRequestDialog({
  meetingId,
  topicRequest,
  open,
  onOpenChange,
}: {
  meetingId: string;
  topicRequest: TopicRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const priorityId = useId();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: toFormValues(topicRequest),
  });

  // 別の議題を編集対象に切り替えたら、フォームを最新値で reset する。
  useEffect(() => {
    reset(toFormValues(topicRequest));
  }, [topicRequest, reset]);

  const mutation = useUpdateTopicRequest(meetingId);

  const onSubmit = (data: FormValues) => {
    // body は空文字 → null で「クリア」を表現する。
    // priority は "" → null で同様に未指定へ戻す。
    mutation.mutate(
      {
        id: topicRequest.id,
        patch: {
          title: data.title,
          body: data.body === "" ? null : data.body,
          priority: data.priority === "" ? null : data.priority,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>議題を編集</DialogTitle>
            <DialogDescription>
              タイトル・詳細・優先度を変更できます。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={titleId}>タイトル</Label>
              <Input id={titleId} {...register("title")} />
              {errors.title && (
                <p className="text-sm text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={bodyId}>詳細（任意）</Label>
              <Textarea id={bodyId} rows={4} {...register("body")} />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={priorityId}>優先度（任意）</Label>
              <select
                id={priorityId}
                className="border rounded-md px-3 py-2 text-sm bg-background"
                {...register("priority")}
              >
                <option value="">未指定</option>
                <option value="required">
                  {topicRequestPriorityLabels.required}
                </option>
                <option value="optional">
                  {topicRequestPriorityLabels.optional}
                </option>
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
          {mutation.isError && (
            <p className="text-sm text-destructive mt-2">
              更新に失敗しました。時間をおいて再度お試しください。
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
