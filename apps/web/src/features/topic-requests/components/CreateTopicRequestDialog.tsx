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
import { Textarea } from "@/components/ui/textarea";
import { useCreateTopicRequest } from "@/features/topic-requests/hooks/useCreateTopicRequest";
import { topicRequestPriorityLabels } from "@/features/topic-requests/labels";
import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// priority は select 用に "" を「未指定」として扱うフォーム表現。送信時に undefined に変換する。
const formSchema = z.object({
  title: z.string().min(1, "タイトルは必須です"),
  body: z.string(),
  priority: z.enum(["", "required", "optional"]),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateTopicRequestDialog({
  meetingId,
  trigger,
}: {
  meetingId: string;
  trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
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
    defaultValues: { title: "", body: "", priority: "" },
  });

  const mutation = useCreateTopicRequest(meetingId);

  const onSubmit = (data: FormValues) => {
    mutation.mutate(
      {
        title: data.title,
        body: data.body || undefined,
        priority: data.priority || undefined,
      },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button>議題を追加</Button>}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>次回会議の議題を追加</DialogTitle>
            <DialogDescription>
              この会議で取り上げる議題を事前に登録します。AI
              が生成する推奨アジェンダとは別枠で扱われます。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={titleId}>タイトル</Label>
              <Input
                id={titleId}
                placeholder="例: 次回までに決めたい仕様"
                {...register("title")}
              />
              {errors.title && (
                <p className="text-sm text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={bodyId}>詳細（任意）</Label>
              <Textarea
                id={bodyId}
                placeholder="議題の背景や前提条件など"
                rows={4}
                {...register("body")}
              />
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
              onClick={() => setOpen(false)}
            >
              キャンセル
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "追加中..." : "追加"}
            </Button>
          </DialogFooter>
          {mutation.isError && (
            <p className="text-sm text-destructive mt-2">
              追加に失敗しました。時間をおいて再度お試しください。
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
