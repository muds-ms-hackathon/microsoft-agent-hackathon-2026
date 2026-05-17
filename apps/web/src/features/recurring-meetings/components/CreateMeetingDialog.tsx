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
import { api, authHeaders } from "@/lib/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { DurationMinutesPicker } from "./DurationMinutesPicker";

const createSchema = z.object({
  title: z.string().min(1, "タイトルは必須です"),
  // datetime-local の値は "YYYY-MM-DDTHH:mm" 形式（タイムゾーンなし）。
  // 送信時に new Date(value).toISOString() で UTC ISO8601 に変換する。
  heldAt: z.string().min(1, "日時は必須です"),
  estimatedDurationMinutes: z
    .number()
    .int()
    .min(1, "所要時間は 1 分以上で指定してください")
    .max(480, "所要時間は 480 分以下で指定してください"),
});

type CreateFormValues = z.infer<typeof createSchema>;

export function CreateMeetingDialog({
  recurringMeetingId,
  defaultDurationMinutes,
}: {
  recurringMeetingId: string;
  // 定例の defaultDurationMinutes を初期値として使う。
  defaultDurationMinutes: number;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const titleId = useId();
  const heldAtId = useId();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      title: "",
      heldAt: "",
      estimatedDurationMinutes: defaultDurationMinutes,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateFormValues) => {
      // datetime-local の文字列をローカル時刻として解釈し、UTC ISO8601 に変換。
      const heldAtIso = new Date(data.heldAt).toISOString();
      const res = await api["recurring-meetings"][":id"].meetings.$post(
        {
          param: { id: recurringMeetingId },
          json: {
            title: data.title,
            heldAt: heldAtIso,
            estimatedDurationMinutes: data.estimatedDurationMinutes,
          },
        },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to create meeting: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["recurring-meetings", recurringMeetingId, "meetings"],
      });
      reset({
        title: "",
        heldAt: "",
        estimatedDurationMinutes: defaultDurationMinutes,
      });
      setOpen(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset({
            title: "",
            heldAt: "",
            estimatedDurationMinutes: defaultDurationMinutes,
          });
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>会議を追加</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>会議を追加</DialogTitle>
          <DialogDescription>
            この定例配下に紐付ける個別会議の情報を入力してください。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={titleId}>タイトル</Label>
            <Input
              id={titleId}
              placeholder="例: 週次定例 2026-05-20"
              {...register("title")}
            />
            {errors.title && (
              <p role="alert" className="text-destructive text-sm">
                {errors.title.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={heldAtId}>開催日時</Label>
            <Input
              id={heldAtId}
              type="datetime-local"
              {...register("heldAt")}
            />
            {errors.heldAt && (
              <p role="alert" className="text-destructive text-sm">
                {errors.heldAt.message}
              </p>
            )}
          </div>
          <Controller
            name="estimatedDurationMinutes"
            control={control}
            render={({ field }) => (
              <DurationMinutesPicker
                value={field.value}
                onChange={field.onChange}
                error={errors.estimatedDurationMinutes?.message}
              />
            )}
          />
          {mutation.isError && (
            <p className="text-destructive text-sm">会議の追加に失敗しました</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              追加
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
