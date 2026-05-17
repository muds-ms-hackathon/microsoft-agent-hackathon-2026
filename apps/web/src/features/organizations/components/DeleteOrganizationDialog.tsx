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
import { useDeleteOrganization } from "@/features/organizations/hooks/useDeleteOrganization";
import { useId, useState } from "react";

// 組織削除確認ダイアログ。
// 誤操作防止のため、組織名と一致するテキストを入力するまで実行ボタンを無効化する。
// 削除成功後は親に通知（一覧へ遷移するのは親の責務）。
export function DeleteOrganizationDialog({
  org,
  onDeleted,
}: {
  org: { id: string; name: string };
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const confirmId = useId();

  const mutation = useDeleteOrganization(org.id, onDeleted);
  const matches = confirmText === org.name;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmText("");
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">組織を削除</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>組織を削除</DialogTitle>
          <DialogDescription>
            この操作は取り消せません。関連する定例・メンバーシップもすべて削除されます。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={confirmId}>確認のため組織名を入力してください</Label>
          <Input
            id={confirmId}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={org.name}
          />
        </div>
        {mutation.isError && (
          <p className="text-destructive text-sm">削除に失敗しました</p>
        )}
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!matches || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            削除を実行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
