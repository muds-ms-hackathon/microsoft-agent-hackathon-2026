import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useMeetingTopicRequests } from "@/features/topic-requests/hooks/useMeetingTopicRequests";
import { CreateTopicRequestDialog } from "./CreateTopicRequestDialog";
import { TopicRequestItem } from "./TopicRequestItem";

export function TopicRequestSection({ meetingId }: { meetingId: string }) {
  const query = useMeetingTopicRequests(meetingId);

  const topicRequests = query.data ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 w-full">
          <div className="flex flex-col gap-1">
            <CardTitle>次回会議の議題</CardTitle>
            <CardDescription>
              この会議で取り上げる議題を事前に登録できます。AI
              が生成する推奨アジェンダとは別枠で管理されます。
            </CardDescription>
          </div>
          <CreateTopicRequestDialog meetingId={meetingId} />
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">読み込み中...</p>
        ) : query.isError ? (
          <p className="text-sm text-destructive">
            議題の読み込みに失敗しました。
          </p>
        ) : topicRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだ議題が登録されていません。「議題を追加」から登録してください。
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {topicRequests.map((topicRequest) => (
              <TopicRequestItem
                key={topicRequest.id}
                meetingId={meetingId}
                topicRequest={topicRequest}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
