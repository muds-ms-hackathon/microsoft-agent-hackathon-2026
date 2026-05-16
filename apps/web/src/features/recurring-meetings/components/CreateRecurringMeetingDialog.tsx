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
import { type ReactNode, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { buildCron, defaultCronBuilderState } from "../scheduleCron";
import { ScheduleCronBuilder } from "./ScheduleCronBuilder";

// API 側 schema と同じ：scheduleCron は「スペース区切り 5 フィールド」のみ検証する。
// ビルダー UI を経由する場合は常に有効な cron が生成されるため、フォーム値としては
// regex を満たすが、防御的に schema 側も維持しておく。
const cronFieldFormat = /^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/;

const createSchema = z.object({
  name: z.string().min(1, "定例名は必須です"),
  description: z.string().optional(),
  scheduleCron: z
    .string()
    .min(1, "開催頻度は必須です")
    .regex(cronFieldFormat, "スペース区切りで 5 フィールドを入力してください"),
});

type CreateFormValues = z.infer<typeof createSchema>;

export function CreateRecurringMeetingDialog({
  orgId,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  orgId: string;
  // 任意のトリガー要素を差し込み可能にする。未指定時は「定例を作成」ボタンを使う。
  trigger?: ReactNode;
  // 制御モード用。サイドバー等の外側 UI から開きたい場合に使う。
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (onOpenChange) onOpenChange(next);
    if (openProp === undefined) setInternalOpen(next);
  };

  const queryClient = useQueryClient();
  const nameId = useId();
  const descriptionId = useId();
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      description: "",
      scheduleCron: buildCron(defaultCronBuilderState),
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateFormValues) => {
      // description は空文字なら API に渡さない（API 側 schema が optional のため）。
      const json: {
        name: string;
        description?: string;
        scheduleCron: string;
      } = { name: data.name, scheduleCron: data.scheduleCron };
      if (data.description && data.description.length > 0) {
        json.description = data.description;
      }
      const res = await api.organizations[":id"].meetings.$post(
        { param: { id: orgId }, json },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to create recurring meeting: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // 組織詳細とサイドバーの定例リスト用クエリを更新する。
      queryClient.invalidateQueries({ queryKey: ["organizations", orgId] });
      queryClient.invalidateQueries({
        queryKey: ["organizations", orgId, "meetings"],
      });
      reset();
      setOpen(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          mutation.reset();
        }
      }}
    >
      {/* 外部から open を制御する場合（サイドバーから開く等）はトリガーを描画しない。
          ダイアログのトリガー責務を外側に委ねるためのパターン。 */}
      {openProp === undefined && (
        <DialogTrigger asChild>
          {trigger ?? <Button>定例を作成</Button>}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>定例を作成</DialogTitle>
          <DialogDescription>
            開催する定例の情報を入力してください。頻度は「毎日 / 毎週 /
            毎月」から選び、曜日や時刻を指定します。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>定例名</Label>
            <Input
              id={nameId}
              placeholder="例: 週次定例"
              {...register("name")}
            />
            {errors.name && (
              <p role="alert" className="text-destructive text-sm">
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={descriptionId}>説明</Label>
            <Input
              id={descriptionId}
              placeholder="定例の目的・進め方（任意）"
              {...register("description")}
            />
          </div>
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
          {mutation.isError && (
            <p className="text-destructive text-sm">定例の作成に失敗しました</p>
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
