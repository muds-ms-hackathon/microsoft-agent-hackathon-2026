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
import { useLeaveOrganization } from "@/features/organizations/hooks/useLeaveOrganization";
import { useState } from "react";

// 組織からの退会確認ダイアログ（#125）。
// 退会成功後は親に通知（一覧へ遷移するのは親の責務。ページ自体が見えなくなる前提）。
export function LeaveOrganizationDialog({
  org,
  onLeft,
}: {
  org: { id: string; name: string };
  onLeft: () => void;
}) {
  const [open, setOpen] = useState(false);
  const mutation = useLeaveOrganization(org.id, onLeft);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) mutation.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">組織を退会</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>組織を退会</DialogTitle>
          <DialogDescription>
            「{org.name}」から退会します。再び参加するには新しい招待が必要です。
          </DialogDescription>
        </DialogHeader>
        {mutation.isError && (
          <p className="text-destructive text-sm">退会に失敗しました</p>
        )}
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            退会する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
