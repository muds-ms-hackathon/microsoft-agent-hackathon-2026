-- CreateEnum
CREATE TYPE "DecisionItemStatus" AS ENUM ('draft', 'reviewing', 'open', 'decided', 'cancelled');

-- CreateEnum
CREATE TYPE "DecisionState" AS ENUM ('confirmed', 'tentative', 'open');

-- CreateEnum
CREATE TYPE "DecisionReason" AS ENUM ('no_consensus', 'information_lack', 'intentional_defer', 'not_discussed');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('draft', 'reviewing', 'todo', 'in_progress', 'done', 'rejected');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('required', 'optional');

-- CreateEnum
CREATE TYPE "AmbiguousInfoStatus" AS ENUM ('draft', 'reviewing', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "AmbiguityType" AS ENUM ('missing_speaker', 'transcription_error_low', 'transcription_error_high', 'no_assignee', 'no_deadline_mentioned', 'no_deadline_absolute', 'unclear_decision', 'insufficient_basis', 'unclear_scope');

-- CreateEnum
CREATE TYPE "AmbiguitySeverity" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "ResolutionType" AS ENUM ('task', 'decision_item', 'discarded');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('resolved', 'unresolved', 'unknown');

-- CreateEnum
CREATE TYPE "EstimationBreakdownType" AS ENUM ('required_task_check', 'open_issue_new', 'open_issue_recurring', 'overdue_task', 'new_topic', 'tentative_reconfirm', 'buffer');

-- CreateTable
CREATE TABLE "MeetingSpeaker" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT,
    "resolutionStatus" "ResolutionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSpeaker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingEstimationBreakdown" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "type" "EstimationBreakdownType" NOT NULL,
    "count" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingEstimationBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagDocument" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "themeKeywords" JSONB NOT NULL,
    "confirmedDecisionTexts" JSONB NOT NULL,
    "openIssueTexts" JSONB NOT NULL,
    "participantNames" JSONB NOT NULL,
    "indexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelatedPastMeeting" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "relatedMeetingId" TEXT NOT NULL,
    "relevanceSummary" TEXT NOT NULL,
    "recurringFlag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelatedPastMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "sourceQuote" TEXT,
    "sourceContext" TEXT,
    "status" "DecisionItemStatus" NOT NULL,
    "decisionState" "DecisionState",
    "reason" "DecisionReason",
    "blockingItemId" TEXT,
    "recurrenceCount" INTEGER,
    "ambiguityFlags" JSONB,
    "decisionDeadline" TIMESTAMP(3),
    "plannedMeetingId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionItemAssignee" (
    "id" TEXT NOT NULL,
    "decisionItemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DecisionItemAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "decisionItemId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "sourceQuote" TEXT,
    "sourceContext" TEXT,
    "status" "TaskStatus" NOT NULL,
    "priority" "TaskPriority",
    "dueDateRaw" TEXT,
    "dueDateEstimated" BOOLEAN,
    "assigneeRaw" TEXT,
    "blockingItemId" TEXT,
    "carriedOverCount" INTEGER,
    "ambiguityFlags" JSONB,
    "dueDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3),
    "followUpDate" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbiguousInfo" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceQuote" TEXT,
    "sourceContext" TEXT,
    "status" "AmbiguousInfoStatus" NOT NULL,
    "ambiguityType" "AmbiguityType",
    "severity" "AmbiguitySeverity",
    "inferenceBasis" TEXT,
    "dueDateRaw" TEXT,
    "dueDateEstimated" BOOLEAN,
    "affectedItemIds" JSONB,
    "resolutionType" "ResolutionType",
    "resolvedToTaskId" TEXT,
    "resolvedToDecisionItemId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmbiguousInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingSpeaker_meetingId_idx" ON "MeetingSpeaker"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingEstimationBreakdown_meetingId_idx" ON "MeetingEstimationBreakdown"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "RagDocument_meetingId_key" ON "RagDocument"("meetingId");

-- CreateIndex
CREATE INDEX "RelatedPastMeeting_meetingId_idx" ON "RelatedPastMeeting"("meetingId");

-- CreateIndex
CREATE INDEX "RelatedPastMeeting_relatedMeetingId_idx" ON "RelatedPastMeeting"("relatedMeetingId");

-- CreateIndex
CREATE UNIQUE INDEX "RelatedPastMeeting_meetingId_relatedMeetingId_key" ON "RelatedPastMeeting"("meetingId", "relatedMeetingId");

-- CreateIndex
CREATE INDEX "DecisionItem_meetingId_idx" ON "DecisionItem"("meetingId");

-- CreateIndex
CREATE INDEX "DecisionItem_status_idx" ON "DecisionItem"("status");

-- CreateIndex
CREATE INDEX "DecisionItemAssignee_decisionItemId_idx" ON "DecisionItemAssignee"("decisionItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionItemAssignee_decisionItemId_userId_key" ON "DecisionItemAssignee"("decisionItemId", "userId");

-- CreateIndex
CREATE INDEX "Task_meetingId_idx" ON "Task"("meetingId");

-- CreateIndex
CREATE INDEX "Task_decisionItemId_idx" ON "Task"("decisionItemId");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");

-- CreateIndex
CREATE INDEX "Task_startDate_idx" ON "Task"("startDate");

-- CreateIndex
CREATE INDEX "TaskAssignee_taskId_idx" ON "TaskAssignee"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignee_taskId_userId_key" ON "TaskAssignee"("taskId", "userId");

-- CreateIndex
CREATE INDEX "AmbiguousInfo_meetingId_idx" ON "AmbiguousInfo"("meetingId");

-- CreateIndex
CREATE INDEX "AmbiguousInfo_status_idx" ON "AmbiguousInfo"("status");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "ReadLog_userId_resourceType_resourceId_idx" ON "ReadLog"("userId", "resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "MeetingSpeaker" ADD CONSTRAINT "MeetingSpeaker_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSpeaker" ADD CONSTRAINT "MeetingSpeaker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingEstimationBreakdown" ADD CONSTRAINT "MeetingEstimationBreakdown_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RagDocument" ADD CONSTRAINT "RagDocument_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatedPastMeeting" ADD CONSTRAINT "RelatedPastMeeting_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelatedPastMeeting" ADD CONSTRAINT "RelatedPastMeeting_relatedMeetingId_fkey" FOREIGN KEY ("relatedMeetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionItem" ADD CONSTRAINT "DecisionItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionItem" ADD CONSTRAINT "DecisionItem_plannedMeetingId_fkey" FOREIGN KEY ("plannedMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionItem" ADD CONSTRAINT "DecisionItem_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionItemAssignee" ADD CONSTRAINT "DecisionItemAssignee_decisionItemId_fkey" FOREIGN KEY ("decisionItemId") REFERENCES "DecisionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionItemAssignee" ADD CONSTRAINT "DecisionItemAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_decisionItemId_fkey" FOREIGN KEY ("decisionItemId") REFERENCES "DecisionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbiguousInfo" ADD CONSTRAINT "AmbiguousInfo_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbiguousInfo" ADD CONSTRAINT "AmbiguousInfo_resolvedToTaskId_fkey" FOREIGN KEY ("resolvedToTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbiguousInfo" ADD CONSTRAINT "AmbiguousInfo_resolvedToDecisionItemId_fkey" FOREIGN KEY ("resolvedToDecisionItemId") REFERENCES "DecisionItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadLog" ADD CONSTRAINT "ReadLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
