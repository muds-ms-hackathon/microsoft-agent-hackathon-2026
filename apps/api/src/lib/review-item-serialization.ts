import type { Prisma } from "@prisma/client";

const userSelect = {
  id: true,
  name: true,
  displayName: true,
  email: true,
} as const;

const recurringMeetingSelect = { id: true, name: true } as const;

export const decisionItemReviewInclude = {
  assignees: { include: { user: { select: userSelect } } },
  meeting: { select: { recurringMeeting: { select: recurringMeetingSelect } } },
} as const satisfies Prisma.DecisionItemInclude;

export const taskReviewInclude = {
  assignees: { include: { user: { select: userSelect } } },
  originMeeting: {
    select: { recurringMeeting: { select: recurringMeetingSelect } },
  },
} as const satisfies Prisma.TaskInclude;

export const ambiguousInfoReviewInclude = {
  meeting: { select: { recurringMeeting: { select: recurringMeetingSelect } } },
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

export function serializeDecisionItem(item: DecisionItemWithReview) {
  // status:"open" は未決確定済み → decisionState によらず open_issue のまま
  const type =
    item.status !== "open" &&
    (item.decisionState === "confirmed" || item.decisionState === "tentative")
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
    resolutionType: null,
    meetingId: item.meetingId,
    // biome-ignore lint/style/noNonNullAssertion: レビューアイテムは必ず定例配下の会議に属する
    recurringMeetingId: item.meeting.recurringMeeting!.id,
    // biome-ignore lint/style/noNonNullAssertion: 同上
    recurringMeetingName: item.meeting.recurringMeeting!.name,
    assignees: item.assignees.map((a) => a.user),
    deadline: item.decisionDeadline,
    version: item.version,
  };
}

// originMeetingId・originMeeting は review 用クエリの where 条件（originMeetingId: { not: null }）で非 null が保証される。
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
    resolutionType: null,
    // biome-ignore lint/style/noNonNullAssertion: where 条件で originMeetingId: { not: null } を保証済み
    meetingId: task.originMeetingId!,
    // biome-ignore lint/style/noNonNullAssertion: 同上
    recurringMeetingId: task.originMeeting!.recurringMeeting!.id,
    // biome-ignore lint/style/noNonNullAssertion: 同上
    recurringMeetingName: task.originMeeting!.recurringMeeting!.name,
    assignees: task.assignees.map((a) => a.user),
    deadline: task.dueDate,
    version: task.version,
  };
}

export function serializeAmbiguousInfo(item: AmbiguousInfoWithReview) {
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
    resolutionType: item.resolutionType,
    meetingId: item.meetingId,
    // biome-ignore lint/style/noNonNullAssertion: レビューアイテムは必ず定例配下の会議に属する
    recurringMeetingId: item.meeting.recurringMeeting!.id,
    // biome-ignore lint/style/noNonNullAssertion: 同上
    recurringMeetingName: item.meeting.recurringMeeting!.name,
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
