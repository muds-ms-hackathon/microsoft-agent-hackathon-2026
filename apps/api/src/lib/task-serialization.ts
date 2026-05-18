import type { Prisma } from "@prisma/client";

// タスク詳細 (GET /tasks/:id, POST /tasks, PATCH /tasks/:id) 用の include。
// 担当者ユーザーは email まで含めて返す。
export const taskDetailInclude = {
  assignees: {
    include: {
      user: {
        select: { id: true, name: true, displayName: true, email: true },
      },
    },
  },
  recurringMeetings: {
    include: {
      recurringMeeting: { select: { id: true, name: true } },
    },
  },
  originMeeting: {
    select: { id: true, title: true, heldAt: true, recurringMeetingId: true },
  },
  organization: { select: { id: true, name: true } },
} as const satisfies Prisma.TaskInclude;

// 一覧 API 用の include。詳細との差分は assignees.user に email を含めないこと。
// 一覧で大量のメールアドレスを返す必要がないため最小化する。
export const taskListInclude = {
  assignees: {
    include: {
      user: { select: { id: true, name: true, displayName: true } },
    },
  },
  recurringMeetings: {
    include: {
      recurringMeeting: { select: { id: true, name: true } },
    },
  },
  originMeeting: {
    select: { id: true, title: true, heldAt: true, recurringMeetingId: true },
  },
  organization: { select: { id: true, name: true } },
} as const satisfies Prisma.TaskInclude;

// `taskDetailInclude` / `taskListInclude` を Prisma の include 引数として使った場合に
// 得られる Task のペイロード型。`serializeTask` の引数で `any` を使わずに済むようにし、
// 中間テーブル (TaskAssignee / TaskRecurringMeeting) の構造を型レベルで保証する。
// list 側は assignees.user に email を含めない差分のみで、構造は detail と同じ。
export type TaskWithDetail = Prisma.TaskGetPayload<{
  include: typeof taskDetailInclude;
}>;
export type TaskWithList = Prisma.TaskGetPayload<{
  include: typeof taskListInclude;
}>;

// 一覧のデフォルト並び順。期限が近いタスク優先で、期限未設定 (NULL) は末尾、
// 同期限内は最近更新されたものを上に出す。
export const taskListOrderBy: Prisma.TaskOrderByWithRelationInput[] = [
  { dueDate: { sort: "asc", nulls: "last" } },
  { updatedAt: "desc" },
];

// Prisma が返す中間テーブル経由の構造をフロント向けに平坦化する。
// detail / list の両方で共通利用するためユニオン型を受ける。
export function serializeTask(task: TaskWithDetail | TaskWithList) {
  const { assignees, recurringMeetings, ...rest } = task;
  return {
    ...rest,
    assignees: assignees.map((a) => a.user),
    recurringMeetings: recurringMeetings.map((r) => r.recurringMeeting),
  };
}
