import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteTask } from "@/features/tasks/hooks/useDeleteTask";
import type { Task } from "@/features/tasks/types";

// タスク削除の確認ダイアログ。親（EditTaskDialog や行のメニュー）から open を制御する。
// onDeleted で親に削除完了を通知し、編集ダイアログを閉じる等のフローを任せる。
export function DeleteTaskDialog({
  task,
  open,
  onOpenChange,
  onDeleted,
}: {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const mutation = useDeleteTask();

  const onConfirm = () => {
    mutation.mutate(task.id, {
      onSuccess: () => {
        onOpenChange(false);
        if (onDeleted) onDeleted();
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) mutation.reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>タスクを削除</DialogTitle>
          <DialogDescription>
            {`「${task.title}」を削除しますか？この操作は取り消せません。`}
          </DialogDescription>
        </DialogHeader>
        {mutation.isError && (
          <p className="text-destructive text-sm">タスクの削除に失敗しました</p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={mutation.isPending}
          >
            削除を実行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
