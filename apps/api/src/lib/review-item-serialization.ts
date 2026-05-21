import type { Prisma } from "@prisma/client";

const userSelect = {
  id: true,
  name: true,
  displayName: true,
  email: true,
} as const;

export const decisionItemReviewInclude = {
  assignees: { include: { user: { select: userSelect } } },
  meeting: { select: { recurringMeetingId: true } },
} as const satisfies Prisma.DecisionItemInclude;

export const taskReviewInclude = {
  assignees: { include: { user: { select: userSelect } } },
  originMeeting: { select: { recurringMeetingId: true } },
} as const satisfies Prisma.TaskInclude;

export const ambiguousInfoReviewInclude = {
  meeting: { select: { recurringMeetingId: true } },
} as const satisfies Prisma.AmbiguousInfoInclude;

type DecisionItemWithReview = Prisma.DecisionItemGetPayload<{
  include: typeof decisionItemReviewInclude;
}>;
type TaskWithReview = Prisma.TaskGetPayload<{
  include: typeof taskReviewInclude;
}>;
type AmbiguousInfoWithReview = Prisma.AmbiguousInfoGetPayload<{
  include: typeof ambiguousInfoReviewInclude;
}>;

function serializeDecisionItem(item: DecisionItemWithReview) {
  const type =
    item.decisionState === "confirmed" || item.decisionState === "tentative"
      ? ("decision" as const)
      : ("open_issue" as const);
  return {
    id: item.id,
    sourceTable: "decision_item" as const,
    type,
    status: item.status,
    title: item.title,
    body: item.body,
    sourceQuote: item.sourceQuote,
    sourceContext: item.sourceContext,
    severity: null,
    meetingId: item.meetingId,
    recurringMeetingId: item.meeting.recurringMeetingId,
    assignees: item.assignees.map((a) => a.user),
    deadline: item.decisionDeadline,
    version: item.version,
  };
}

// originMeetingId は review 用クエリで常に非 null（where 条件で保証）。
function serializeTaskAsReviewItem(task: TaskWithReview) {
  return {
    id: task.id,
    sourceTable: "task" as const,
    type: "task_candidate" as const,
    status: task.status,
    title: task.title,
    body: task.body,
    sourceQuote: task.sourceQuote,
    sourceContext: task.sourceContext,
    severity: null,
    meetingId: task.originMeetingId as string,
    recurringMeetingId: task.originMeeting?.recurringMeetingId ?? null,
    assignees: task.assignees.map((a) => a.user),
    deadline: task.dueDate,
    version: task.version,
  };
}

function serializeAmbiguousInfo(item: AmbiguousInfoWithReview) {
  return {
    id: item.id,
    sourceTable: "ambiguous_info" as const,
    type: "ambiguity" as const,
    status: item.status,
    title: item.body,
    body: null,
    sourceQuote: item.sourceQuote,
    sourceContext: item.sourceContext,
    severity: item.severity,
    meetingId: item.meetingId,
    recurringMeetingId: item.meeting.recurringMeetingId,
    assignees: [],
    deadline: null,
    version: item.version,
  };
}

export function serializeReviewItems({
  decisionItems,
  tasks,
  ambiguousInfos,
}: {
  decisionItems: DecisionItemWithReview[];
  tasks: TaskWithReview[];
  ambiguousInfos: AmbiguousInfoWithReview[];
}) {
  return [
    ...decisionItems.map(serializeDecisionItem),
    ...tasks.map(serializeTaskAsReviewItem),
    ...ambiguousInfos.map(serializeAmbiguousInfo),
  ];
}
