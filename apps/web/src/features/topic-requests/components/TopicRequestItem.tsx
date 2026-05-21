import { Button } from "@/components/ui/button";
import { topicRequestPriorityLabels } from "@/features/topic-requests/labels";
import type { TopicRequest } from "@/features/topic-requests/types";
import { useState } from "react";
import { DeleteTopicRequestDialog } from "./DeleteTopicRequestDialog";
import { EditTopicRequestDialog } from "./EditTopicRequestDialog";

export function TopicRequestItem({
  meetingId,
  topicRequest,
}: {
  meetingId: string;
  topicRequest: TopicRequest;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className="rounded-md border p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{topicRequest.title}</span>
            {topicRequest.priority && (
              <span
                className={`text-xs rounded-full px-2 py-0.5 border ${
                  topicRequest.priority === "required"
                    ? "border-destructive text-destructive"
                    : "border-muted-foreground text-muted-foreground"
                }`}
              >
                {topicRequestPriorityLabels[topicRequest.priority]}
              </span>
            )}
          </div>
          {topicRequest.body && (
            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">
              {topicRequest.body}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            編集
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            削除
          </Button>
        </div>
      </div>

      <EditTopicRequestDialog
        meetingId={meetingId}
        topicRequest={topicRequest}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteTopicRequestDialog
        meetingId={meetingId}
        topicRequest={topicRequest}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </div>
  );
}
