-- CreateEnum
CREATE TYPE "TopicRequestPriority" AS ENUM ('required', 'optional');

-- CreateTable
CREATE TABLE "TopicRequest" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "priority" "TopicRequestPriority",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TopicRequest_meetingId_idx" ON "TopicRequest"("meetingId");

-- CreateIndex
CREATE INDEX "TopicRequest_requestedBy_idx" ON "TopicRequest"("requestedBy");

-- AddForeignKey
ALTER TABLE "TopicRequest" ADD CONSTRAINT "TopicRequest_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicRequest" ADD CONSTRAINT "TopicRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
