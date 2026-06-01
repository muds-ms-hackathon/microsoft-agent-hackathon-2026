import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { useMe } from "../hooks/useMe";
import { useUpdateDisplayName } from "../hooks/useUpdateDisplayName";

// 表示名の入力スキーマ。API 側 (PATCH /me) と同じ 1〜50 文字制約に合わせる。
const settingsSchema = z.object({
  displayName: z
    .string()
    .min(1, "表示名を入力してください")
    .max(50, "表示名は50文字以内で入力してください"),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 設定ダイアログ。現状は表示名 (displayName) の編集のみを提供する。
// Topbar の設定ボタンから開閉を制御する想定の制御コンポーネント。
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { data: profile } = useMe();
  const update = useUpdateDisplayName();
  const displayNameId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    // values で非同期取得したプロフィールにフォームを追従させる。
    values: { displayName: profile?.displayName ?? "" },
  });

  const onSubmit = (data: SettingsFormValues) => {
    update.mutate(data.displayName, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>設定</DialogTitle>
            <DialogDescription>表示名を変更できます。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={displayNameId}>表示名</Label>
            <Input id={displayNameId} {...register("displayName")} />
            {errors.displayName && (
              <p role="alert" className="text-destructive text-sm">
                {errors.displayName.message}
              </p>
            )}
            {update.isError && (
              <p role="alert" className="text-destructive text-sm">
                保存に失敗しました。時間をおいて再度お試しください。
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
