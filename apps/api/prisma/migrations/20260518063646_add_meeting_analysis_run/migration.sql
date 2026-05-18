-- CreateTable
CREATE TABLE "MeetingAnalysisRun" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "currentStep" TEXT,
    "triggerType" TEXT,
    "modelName" TEXT,
    "apiVersion" TEXT,
    "promptVersion" TEXT,
    "pipelineVersion" TEXT,
    "inputHash" TEXT,
    "summary" TEXT,
    "alertLevel" TEXT,
    "reportJson" JSONB,
    "rawOutputsJson" JSONB,
    "validationWarnings" JSONB,
    "ragRetrievalJson" JSONB,
    "recommendedAgenda" JSONB,
    "resourceRefsJson" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingAnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingAnalysisRun_meetingId_idx" ON "MeetingAnalysisRun"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingAnalysisRun_meetingId_status_idx" ON "MeetingAnalysisRun"("meetingId", "status");

-- CreateIndex
CREATE INDEX "MeetingAnalysisRun_meetingId_createdAt_idx" ON "MeetingAnalysisRun"("meetingId", "createdAt");

-- CreateIndex
CREATE INDEX "MeetingAnalysisRun_status_idx" ON "MeetingAnalysisRun"("status");

-- AddForeignKey
ALTER TABLE "MeetingAnalysisRun" ADD CONSTRAINT "MeetingAnalysisRun_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
