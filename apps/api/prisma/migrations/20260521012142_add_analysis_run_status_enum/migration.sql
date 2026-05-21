/*
  Warnings:

  - The `status` column on the `MeetingAnalysisRun` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "AnalysisRunStatus" AS ENUM ('queued', 'analyzing', 'completed', 'failed');

-- AlterTable
ALTER TABLE "MeetingAnalysisRun" DROP COLUMN "status",
ADD COLUMN     "status" "AnalysisRunStatus" NOT NULL DEFAULT 'queued';

-- CreateIndex
CREATE INDEX "MeetingAnalysisRun_meetingId_status_idx" ON "MeetingAnalysisRun"("meetingId", "status");

-- CreateIndex
CREATE INDEX "MeetingAnalysisRun_status_idx" ON "MeetingAnalysisRun"("status");
