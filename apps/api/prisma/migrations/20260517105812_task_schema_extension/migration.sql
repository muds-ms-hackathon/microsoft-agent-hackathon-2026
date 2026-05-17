/*
  Warnings:

  - You are about to drop the column `meetingId` on the `Task` table. All the data in the column will be lost.
  - Added the required column `organizationId` to the `Task` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_meetingId_fkey";

-- DropIndex
DROP INDEX "Task_meetingId_idx";

-- AlterTable
ALTER TABLE "Task" DROP COLUMN "meetingId",
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD COLUMN     "originMeetingId" TEXT,
ADD COLUMN     "progressNote" TEXT;

-- CreateTable
CREATE TABLE "TaskRecurringMeeting" (
    "taskId" TEXT NOT NULL,
    "recurringMeetingId" TEXT NOT NULL,

    CONSTRAINT "TaskRecurringMeeting_pkey" PRIMARY KEY ("taskId","recurringMeetingId")
);

-- CreateIndex
CREATE INDEX "TaskRecurringMeeting_recurringMeetingId_idx" ON "TaskRecurringMeeting"("recurringMeetingId");

-- CreateIndex
CREATE INDEX "Task_organizationId_idx" ON "Task"("organizationId");

-- CreateIndex
CREATE INDEX "Task_originMeetingId_idx" ON "Task"("originMeetingId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_originMeetingId_fkey" FOREIGN KEY ("originMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRecurringMeeting" ADD CONSTRAINT "TaskRecurringMeeting_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRecurringMeeting" ADD CONSTRAINT "TaskRecurringMeeting_recurringMeetingId_fkey" FOREIGN KEY ("recurringMeetingId") REFERENCES "RecurringMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
