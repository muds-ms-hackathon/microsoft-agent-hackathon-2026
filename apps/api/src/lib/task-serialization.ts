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

// 一覧のデフォルト並び順。期限が近いタスク優先で、期限未設定 (NULL) は末尾、
// 同期限内は最近更新されたものを上に出す。
export const taskListOrderBy: Prisma.TaskOrderByWithRelationInput[] = [
  { dueDate: { sort: "asc", nulls: "last" } },
  { updatedAt: "desc" },
];

// Prisma が返す中間テーブル経由の構造をフロント向けに平坦化する。
// detail / list の両方で共通利用する。
// biome-ignore lint/suspicious/noExplicitAny: include 結果の型が広いので any で受ける
export function serializeTask(task: any) {
  const { assignees, recurringMeetings, ...rest } = task;
  return {
    ...rest,
    // biome-ignore lint/suspicious/noExplicitAny: 中間テーブルの行型
    assignees: assignees.map((a: any) => a.user),
    // biome-ignore lint/suspicious/noExplicitAny: 中間テーブルの行型
    recurringMeetings: recurringMeetings.map((r: any) => r.recurringMeeting),
  };
}
