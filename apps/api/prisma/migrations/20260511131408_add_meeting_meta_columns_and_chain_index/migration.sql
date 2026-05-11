-- AlterTable
ALTER TABLE "Meeting" ALTER COLUMN "meetingType" SET DEFAULT 'one_time';

-- CreateIndex
CREATE INDEX "Meeting_previousMeetingId_idx" ON "Meeting"("previousMeetingId");
