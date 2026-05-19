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
import { useRemoveMember } from "@/features/organizations/hooks/useRemoveMember";
import { useState } from "react";

// メンバー削除確認ダイアログ。
// 削除後はメンバー一覧キャッシュを invalidate（フック側で実施）。
export function DeleteMemberDialog({
  orgId,
  member,
}: {
  orgId: string;
  member: { userId: string; displayName: string };
}) {
  const [open, setOpen] = useState(false);

  const mutation = useRemoveMember(orgId, () => setOpen(false));

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) mutation.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          {`${member.displayName} を削除`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>メンバーを削除</DialogTitle>
          <DialogDescription>
            {`${member.displayName} さんを組織から削除しますか？この操作は取り消せません。`}
          </DialogDescription>
        </DialogHeader>
        {mutation.isError && (
          <p className="text-destructive text-sm">削除に失敗しました</p>
        )}
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(member.userId)}
          >
            削除する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
