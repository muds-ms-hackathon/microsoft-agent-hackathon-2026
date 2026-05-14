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
import { useForm } from "react-hook-form";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1, "組織名は必須です"),
  description: z.string().optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;

export interface CreateOrganizationDialogProps {
  // 任意のトリガー要素を差し込み可能にする。未指定時は「組織を作成」ボタンを使う。
  // ドロップダウンメニューから開くケース等で外部 state を使いたい場合は trigger を
  // 渡さず、open / onOpenChange のセットを使うことを想定する。
  trigger?: ReactNode;
  // 作成成功時に新規組織 ID を受け取るコールバック。サイドバーが「現在の組織」を
  // 切り替えるためにこれを利用する。
  onCreated?: (organizationId: string) => void;
  // 制御モード用。指定された場合は内部 state ではなくこちらに従う。
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateOrganizationDialog({
  trigger,
  onCreated,
  open: openProp,
  onOpenChange,
}: CreateOrganizationDialogProps) {
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
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", description: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateFormValues) => {
      // description は空文字なら API に渡さない（API 側 schema が optional のため）
      const json: { name: string; description?: string } = { name: data.name };
      if (data.description && data.description.length > 0) {
        json.description = data.description;
      }
      // headers は第 2 引数で渡す（第 1 引数に混ぜると無視される）。
      const res = await api.organizations.$post({ json }, authHeaders());
      // 非 2xx を success として扱うと、API が 400/401/500 を返した場合でも
      // Dialog が閉じてしまい、ユーザーが成功したと誤認する。res.ok を見て
      // エラー扱いに落とし、useMutation の onError / isError 経路に流す。
      if (!res.ok) {
        throw new Error(`Failed to create organization: ${res.status}`);
      }
      return (await res.json()) as { id: string };
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      reset();
      setOpen(false);
      if (onCreated) onCreated(created.id);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {/* 外部から open を制御する場合 (openProp 指定時) はトリガーを描画しない。
          サイドバーのドロップダウンメニューから開くようなケースでは、
          DropdownMenuItem 自体がトリガーの役割を担うため、ここに別のトリガーを
          置くと a11y 上の役割が二重化してしまう。 */}
      {openProp === undefined && (
        <DialogTrigger asChild>
          {trigger ?? <Button>組織を作成</Button>}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新しい組織を作成</DialogTitle>
          <DialogDescription>
            組織名と説明（任意）を入力してください。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>組織名</Label>
            <Input
              id={nameId}
              placeholder="例: ACME 株式会社"
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
              placeholder="組織の説明（任意）"
              {...register("description")}
            />
          </div>
          {mutation.isError && (
            <p className="text-destructive text-sm">作成に失敗しました</p>
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
