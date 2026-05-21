import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteTopicRequest } from "@/features/topic-requests/hooks/useDeleteTopicRequest";
import type { TopicRequest } from "@/features/topic-requests/types";

export function DeleteTopicRequestDialog({
  meetingId,
  topicRequest,
  open,
  onOpenChange,
}: {
  meetingId: string;
  topicRequest: TopicRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const mutation = useDeleteTopicRequest(meetingId);

  const onDelete = () => {
    mutation.mutate(topicRequest.id, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>議題を削除しますか？</DialogTitle>
          <DialogDescription>
            「{topicRequest.title}」を削除します。この操作は元に戻せません。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            キャンセル
          </Button>
          <Button
            variant="destructive"
            onClick={onDelete}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "削除中..." : "削除"}
          </Button>
        </DialogFooter>
        {mutation.isError && (
          <p className="text-sm text-destructive mt-2">
            削除に失敗しました。時間をおいて再度お試しください。
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
