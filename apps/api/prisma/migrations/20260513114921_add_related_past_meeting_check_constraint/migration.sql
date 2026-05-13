-- CreateIndex
CREATE UNIQUE INDEX "MeetingSpeaker_meetingId_userId_key" ON "MeetingSpeaker"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- check制約を追加して、RelatedPastMeetingが自己参照を許さないようにする
ALTER TABLE "RelatedPastMeeting"
ADD CONSTRAINT "RelatedPastMeeting_no_self_reference"
CHECK ("meetingId" <> "relatedMeetingId");