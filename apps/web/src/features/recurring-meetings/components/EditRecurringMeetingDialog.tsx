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
import type { RecurringMeeting } from "@/features/organizations/types";
import { api, authHeaders } from "@/lib/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { parseCron } from "../scheduleCron";
import { ScheduleCronBuilder } from "./ScheduleCronBuilder";

// API 側 schema と同じ：scheduleCron は「スペース区切り 5 フィールド」のみ検証。
const cronFieldFormat = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/;

const editSchema = z.object({
  name: z.string().min(1, "定例名は必須です"),
  // 空文字を許容して「説明をクリア」を表現する。
  description: z.string(),
  scheduleCron: z
    .string()
    .min(1, "開催頻度は必須です")
    .regex(cronFieldFormat, "スペース区切りで 5 フィールドを入力してください"),
});

type EditFormValues = z.infer<typeof editSchema>;

export function EditRecurringMeetingDialog({
  meeting,
}: {
  meeting: RecurringMeeting;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const nameId = useId();
  const descriptionId = useId();
  const cronTextId = useId();

  // 既存 cron が builder で表現可能か。表現不可能なら fallback として
  // 生 cron 文字列のテキスト入力を表示する。
  const isBuilderCompatible = useMemo(
    () => parseCron(meeting.scheduleCron) !== null,
    [meeting.scheduleCron],
  );

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: meeting.name,
      description: meeting.description ?? "",
      scheduleCron: meeting.scheduleCron,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: EditFormValues) => {
      // 変更があったフィールドのみを送る。null と "" の混乱を避ける。
      const json: {
        name?: string;
        description?: string;
        scheduleCron?: string;
      } = {};
      if (data.name !== meeting.name) json.name = data.name;
      const prevDescription = meeting.description ?? "";
      if (data.description !== prevDescription) {
        json.description = data.description;
      }
      if (data.scheduleCron !== meeting.scheduleCron) {
        json.scheduleCron = data.scheduleCron;
      }
      if (
        json.name === undefined &&
        json.description === undefined &&
        json.scheduleCron === undefined
      ) {
        return null;
      }
      const res = await api["recurring-meetings"][":id"].$patch(
        { param: { id: meeting.id }, json },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to update recurring meeting: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", meeting.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["organizations", meeting.organizationId, "meetings"],
      });
      setOpen(false);
    },
  });

  // 親が refetch で新しい meeting を渡してきたとき、閉じている間にフォームを同期。
  useEffect(() => {
    if (!open) {
      reset({
        name: meeting.name,
        description: meeting.description ?? "",
        scheduleCron: meeting.scheduleCron,
      });
    }
  }, [meeting.name, meeting.description, meeting.scheduleCron, open, reset]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) mutation.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          編集
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>定例を編集</DialogTitle>
          <DialogDescription>定例の情報を更新します。</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>定例名</Label>
            <Input id={nameId} {...register("name")} />
            {errors.name && (
              <p role="alert" className="text-destructive text-sm">
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={descriptionId}>説明</Label>
            <Input id={descriptionId} {...register("description")} />
          </div>
          {isBuilderCompatible ? (
            <Controller
              name="scheduleCron"
              control={control}
              render={({ field }) => (
                <ScheduleCronBuilder
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.scheduleCron?.message}
                />
              )}
            />
          ) : (
            // 範囲指定やステップ指定など、ビルダーで表現できない既存 cron は
            // テキスト入力で編集する。ビルダーに上書きすると元の cron が
            // 失われるため、本ダイアログでは切替を提供しない。
            <div className="flex flex-col gap-2">
              <Label htmlFor={cronTextId}>開催頻度（cron 形式）</Label>
              <Input id={cronTextId} {...register("scheduleCron")} />
              <p className="text-xs text-muted-foreground">
                この定例には範囲・ステップ指定など複雑な cron 式が使われているため、
                テキスト形式で編集します。
              </p>
              {errors.scheduleCron && (
                <p role="alert" className="text-destructive text-sm">
                  {errors.scheduleCron.message}
                </p>
              )}
            </div>
          )}
          {mutation.isError && (
            <p className="text-destructive text-sm">定例の更新に失敗しました</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
