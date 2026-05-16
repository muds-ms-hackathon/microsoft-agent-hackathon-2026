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
import type { RecurringMeeting } from "@/features/organizations/types";
import { api, authHeaders } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

// 削除権限は API 側で MeetingMember.owner のみに絞られている。
// 自分が owner かどうかは詳細 API を叩かないと判定できないため、UI ではボタンを
// 全員に表示し、403 が返った場合に「権限なし」を明示するエラーハンドリングに切る。
// N+1 リクエストを避けるための割り切り（Issue #89 のコメント参照）。
class ForbiddenError extends Error {}

export function DeleteRecurringMeetingDialog({
  meeting,
}: {
  meeting: RecurringMeeting;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api["recurring-meetings"][":id"].$delete(
        { param: { id: meeting.id } },
        authHeaders(),
      );
      if (res.status === 403) {
        throw new ForbiddenError();
      }
      if (!res.ok) {
        throw new Error(`Failed to delete recurring meeting: ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", meeting.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["organizations", meeting.organizationId, "meetings"],
      });
      setOpen(false);
    },
  });

  const errorMessage = (() => {
    if (!mutation.isError) return null;
    if (mutation.error instanceof ForbiddenError) {
      return "削除権限がありません（定例のオーナーのみ削除可能です）";
    }
    return "定例の削除に失敗しました";
  })();

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
          削除
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>定例を削除</DialogTitle>
          <DialogDescription>
            {`「${meeting.name}」を削除しますか？この操作は取り消せません。配下の会議データもすべて削除されます。`}
          </DialogDescription>
        </DialogHeader>
        {errorMessage && (
          <p className="text-destructive text-sm">{errorMessage}</p>
        )}
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            削除を実行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
