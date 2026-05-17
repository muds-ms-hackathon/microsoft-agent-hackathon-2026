-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "recurringMeetingId" TEXT;

-- CreateIndex
CREATE INDEX "Meeting_recurringMeetingId_idx" ON "Meeting"("recurringMeetingId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_recurringMeetingId_fkey" FOREIGN KEY ("recurringMeetingId") REFERENCES "RecurringMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
