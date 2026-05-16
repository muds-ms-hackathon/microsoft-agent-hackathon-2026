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
import { useForm } from "react-hook-form";
import { z } from "zod";

// API 側 schema と同様、MVP では「スペース区切り 5 フィールド」のみ検証する。
// 詳細な妥当性チェックは cron パーサー導入時に厳格化予定。
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

export function CreateRecurringMeetingDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const nameId = useId();
  const descriptionId = useId();
  const cronId = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", description: "", scheduleCron: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateFormValues) => {
      // description は空文字なら API に渡さない（API 側 schema が optional のため、
      // 空文字を送ると DB 上の null と挙動が一致しなくなる）。
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
      // 組織詳細の recurringMeetings を更新するため、組織詳細クエリを invalidate。
      // サイドバーの定例リスト用クエリも同じ invalidate で更新できるよう、
      // 別 hook 側で同じ key プレフィックスを共有する想定。
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
      <DialogTrigger asChild>
        <Button>定例を作成</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>定例を作成</DialogTitle>
          <DialogDescription>
            開催する定例の情報を入力してください。開催頻度は cron 形式（例:
            毎週月曜10時なら 0 10 * * 1）で入力します。
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
          <div className="flex flex-col gap-2">
            <Label htmlFor={cronId}>開催頻度（cron 形式）</Label>
            <Input
              id={cronId}
              placeholder="0 10 * * 1（毎週月曜10時）"
              {...register("scheduleCron")}
            />
            {errors.scheduleCron && (
              <p role="alert" className="text-destructive text-sm">
                {errors.scheduleCron.message}
              </p>
            )}
          </div>
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
