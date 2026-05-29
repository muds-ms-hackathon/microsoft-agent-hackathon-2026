import type { Prisma } from "@prisma/client";

// 一覧 API 用の include。email を省いて最小化する。
export const decisionItemListInclude = {
  assignees: {
    include: {
      user: { select: { id: true, name: true, displayName: true } },
    },
  },
} as const satisfies Prisma.DecisionItemInclude;

// 更新日時降順。
export const decisionItemListOrderBy: Prisma.DecisionItemOrderByWithRelationInput[] =
  [{ updatedAt: "desc" }];
