/*
  Warnings:

  - A unique constraint covering the columns `[meetingId,type]` on the table `MeetingEstimationBreakdown` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "MeetingEstimationBreakdown_meetingId_type_key" ON "MeetingEstimationBreakdown"("meetingId", "type");
