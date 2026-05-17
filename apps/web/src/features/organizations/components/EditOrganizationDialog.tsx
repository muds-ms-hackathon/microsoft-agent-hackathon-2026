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
import { useUpdateOrganization } from "@/features/organizations/hooks/useUpdateOrganization";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const editSchema = z.object({
  name: z.string().min(1, "組織名は必須です"),
  // 空文字を許容することで API 側で「説明をクリア」を表現できる。
  description: z.string(),
});

type EditFormValues = z.infer<typeof editSchema>;

// 組織情報の編集ダイアログ。
// 「変更があったフィールドのみ送る」差分計算はここで行い、フックは送信処理のみを担う。
export function EditOrganizationDialog({
  org,
}: {
  org: { id: string; name: string; description: string | null };
}) {
  const [open, setOpen] = useState(false);
  const nameId = useId();
  const descriptionId = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: org.name, description: org.description ?? "" },
  });

  const mutation = useUpdateOrganization(org.id, () => setOpen(false));

  // ダイアログが閉じているときに org が変化したら、最新値に合わせて
  // フォームを同期する。これにより以下のフローで stale な値が残るのを防ぐ:
  //   1. 保存成功 → setOpen(false) → invalidateQueries で refetch がキック
  //   2. 親の useQuery が新しい org を返す
  //   3. この effect が走り、reset({ name: 新しい org.name, ... })
  // ダイアログ表示中は useEffect が reset しないため、入力中の値は破壊されない。
  useEffect(() => {
    if (!open) {
      reset({ name: org.name, description: org.description ?? "" });
    }
  }, [org.name, org.description, open, reset]);

  const onSubmit = (data: EditFormValues) => {
    // 変更があったフィールドのみを送る。
    // フォームは description が null のときも "" を初期値に持つため、
    // 「name だけ編集して保存」したケースで API に description: "" が
    // 渡って DB の null が空文字で上書きされる事故を防ぐ。
    const json: { name?: string; description?: string } = {};
    if (data.name !== org.name) json.name = data.name;
    const prevDescription = org.description ?? "";
    if (data.description !== prevDescription) {
      json.description = data.description;
    }
    mutation.mutate(json);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">組織情報を編集</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>組織情報を編集</DialogTitle>
          <DialogDescription>組織名と説明を更新します。</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>組織名</Label>
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
          {mutation.isError && (
            <p className="text-destructive text-sm">更新に失敗しました</p>
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
