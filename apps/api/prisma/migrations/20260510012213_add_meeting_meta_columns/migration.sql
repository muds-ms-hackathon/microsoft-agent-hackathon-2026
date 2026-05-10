/*
  Warnings:

  - The required column `meetingType` was added to the `Meeting` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "estimatedDurationMinutes" INTEGER,
ADD COLUMN     "estimationNote" TEXT,
ADD COLUMN     "meetingType" TEXT NOT NULL,
ADD COLUMN     "previousMeetingId" TEXT,
ADD COLUMN     "sequenceNumber" INTEGER,
ADD COLUMN     "supplementaryMemo" TEXT,
ADD COLUMN     "transcriptionQuality" TEXT;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_previousMeetingId_fkey" FOREIGN KEY ("previousMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
