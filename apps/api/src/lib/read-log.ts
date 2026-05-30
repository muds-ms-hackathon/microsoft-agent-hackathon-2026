// ユーザーによるリソース既読履歴（ReadLog）の操作ヘルパー。
// 未読リマインド（Issue #351）でタスクの既読化・未読判定に利用する。

import { prisma } from "./prisma.js";

// ReadLog.resourceType に格納するタスクの識別子。
// 他リソース（decision_item / ambiguous_info）と区別するための固定値。
export const READ_LOG_RESOURCE_TASK = "task";

// タスクを既読として ReadLog に追記する。
// ReadLog は追記専用の不変ログのため、同一タスクを複数回既読化しても
// 既存行を上書きせず行を追加する（未読判定は最新 readAt で行う）。
export async function markTaskRead(
  userId: string,
  taskId: string,
): Promise<void> {
  await prisma.readLog.create({
    data: {
      userId,
      resourceType: READ_LOG_RESOURCE_TASK,
      resourceId: taskId,
    },
  });
}
