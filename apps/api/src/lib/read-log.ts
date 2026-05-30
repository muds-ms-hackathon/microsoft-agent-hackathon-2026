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

// 指定ユーザーについて、与えたタスク群の未読判定を行い taskId -> unread の Map を返す。
// 未読 = ReadLog 未記録、または 最新 readAt < task.updatedAt（更新後にまだ見ていない）。
// ReadLog を taskId 群で 1 クエリ取得し、メモリ上で集計して N+1 を避ける。
export async function buildTaskUnreadMap(
  userId: string,
  tasks: ReadonlyArray<{ id: string; updatedAt: Date }>,
): Promise<Map<string, boolean>> {
  const unreadMap = new Map<string, boolean>();
  if (tasks.length === 0) return unreadMap;

  const taskIds = tasks.map((t) => t.id);
  const logs = await prisma.readLog.findMany({
    where: {
      userId,
      resourceType: READ_LOG_RESOURCE_TASK,
      resourceId: { in: taskIds },
    },
    select: { resourceId: true, readAt: true },
  });

  // resourceId ごとに最新の readAt を求める（追記専用ログのため複数行あり得る）。
  const latestReadAt = new Map<string, Date>();
  for (const log of logs) {
    const prev = latestReadAt.get(log.resourceId);
    if (!prev || log.readAt > prev) {
      latestReadAt.set(log.resourceId, log.readAt);
    }
  }

  for (const task of tasks) {
    const readAt = latestReadAt.get(task.id);
    unreadMap.set(task.id, !readAt || readAt < task.updatedAt);
  }
  return unreadMap;
}
