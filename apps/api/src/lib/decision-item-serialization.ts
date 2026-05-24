import type { Prisma } from "@prisma/client";

// 詳細 API 用の include。担当者ユーザーは email まで含めて返す。
export const decisionItemDetailInclude = {
  assignees: {
    include: {
      user: {
        select: { id: true, name: true, displayName: true, email: true },
      },
    },
  },
} as const satisfies Prisma.DecisionItemInclude;

// 一覧 API 用の include。email を省いて最小化する。
export const decisionItemListInclude = {
  assignees: {
    include: {
      user: { select: { id: true, name: true, displayName: true } },
    },
  },
} as const satisfies Prisma.DecisionItemInclude;

export type DecisionItemWithDetail = Prisma.DecisionItemGetPayload<{
  include: typeof decisionItemDetailInclude;
}>;
export type DecisionItemWithList = Prisma.DecisionItemGetPayload<{
  include: typeof decisionItemListInclude;
}>;

// 更新日時降順。
export const decisionItemListOrderBy: Prisma.DecisionItemOrderByWithRelationInput[] =
  [{ updatedAt: "desc" }];

// Prisma の中間テーブル構造をフロント向けに平坦化する。
export function serializeDecisionItem(
  item: DecisionItemWithDetail | DecisionItemWithList,
) {
  const { assignees, ...rest } = item;
  return {
    ...rest,
    assignees: assignees.map((a) => a.user),
  };
}
