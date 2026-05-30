// 意思決定の文脈グラフ（Issue #350）を映えさせるためのデモシード。
//
// 1 定例「デモ定例」に 前回 → 今回 → 次回 の 3 会議をチェーンで作り、今回会議に
// 決定・タスク・未決・次回議題を、グラフの全エッジ種別が出るように張る。
//
// すべて固定 ID で upsert するため冪等（何度実行しても重複しない）。
// 既存ユーザー全員をデモ組織のメンバーに追加するので、ログイン中のユーザーで
// すぐにグラフを閲覧できる。`make dev-reset` で DB を空にした後でも単独で動く。

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/decision_loop";
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// 固定 ID（冪等のため）。
const ORG_ID = "demo-decision-graph-org";
const RM_ID = "demo-decision-graph-rm";
const M_PREV = "demo-dg-meeting-prev";
const M_CUR = "demo-dg-meeting-cur";
const M_NEXT = "demo-dg-meeting-next";
const D1 = "demo-dg-decision-1"; // 決定済み
const D2 = "demo-dg-decision-2"; // 未決 → 次回へ持ち越し
const D3 = "demo-dg-decision-3"; // D1 に依存
const T1 = "demo-dg-task-1"; // D1 から派生
const T2 = "demo-dg-task-2"; // 会議から直接発生
const T3 = "demo-dg-task-3"; // T2 に依存
const A1 = "demo-dg-ambiguous-1"; // → T1 で解決
const A2 = "demo-dg-ambiguous-2"; // → D1 で解決
const TR1 = "demo-dg-topic-1"; // 次回議題

async function main() {
  // 1. デモ組織
  await prisma.organization.upsert({
    where: { id: ORG_ID },
    update: { name: "デモ組織（意思決定グラフ）" },
    create: { id: ORG_ID, name: "デモ組織（意思決定グラフ）" },
  });

  // 2. 既存ユーザー全員をデモ組織のメンバーにする（ログイン中のユーザーで閲覧可能にする）
  const users = await prisma.user.findMany({ select: { id: true } });
  if (users.length === 0) {
    console.warn(
      "[seed] ユーザーが 0 件です。先に一度ログインしてユーザーを作成してから再実行してください。",
    );
  }
  for (const u of users) {
    await prisma.organizationMembership.upsert({
      where: {
        userId_organizationId: { userId: u.id, organizationId: ORG_ID },
      },
      update: {},
      create: { userId: u.id, organizationId: ORG_ID, role: "member" },
    });
  }

  // 3. デモ定例
  await prisma.recurringMeeting.upsert({
    where: { id: RM_ID },
    update: {},
    create: {
      id: RM_ID,
      organizationId: ORG_ID,
      name: "デモ定例",
      scheduleCron: "0 10 * * 1", // 毎週月曜 10:00
    },
  });

  // 4. 会議チェーン（前回 → 今回 → 次回）
  await prisma.meeting.upsert({
    where: { id: M_PREV },
    update: {},
    create: {
      id: M_PREV,
      title: "デモ: 前回会議（5/22）",
      heldAt: new Date("2026-05-22T01:00:00Z"),
      recurringMeetingId: RM_ID,
      meetingType: "recurring",
      sequenceNumber: 1,
    },
  });
  await prisma.meeting.upsert({
    where: { id: M_CUR },
    update: { previousMeetingId: M_PREV },
    create: {
      id: M_CUR,
      title: "デモ: 今回会議（5/29）",
      heldAt: new Date("2026-05-29T01:00:00Z"),
      recurringMeetingId: RM_ID,
      meetingType: "recurring",
      sequenceNumber: 2,
      previousMeetingId: M_PREV,
    },
  });
  await prisma.meeting.upsert({
    where: { id: M_NEXT },
    update: { previousMeetingId: M_CUR },
    create: {
      id: M_NEXT,
      title: "デモ: 次回会議（6/5）",
      heldAt: new Date("2026-06-05T01:00:00Z"),
      recurringMeetingId: RM_ID,
      meetingType: "recurring",
      sequenceNumber: 3,
      previousMeetingId: M_CUR,
    },
  });

  // 5. 決定事項（今回会議）
  await prisma.decisionItem.upsert({
    where: { id: D1 },
    update: {},
    create: {
      id: D1,
      meetingId: M_CUR,
      title: "新ロゴ案 B を採用する",
      status: "decided",
      decisionState: "confirmed",
      decidedAt: new Date("2026-05-29T02:00:00Z"),
    },
  });
  // D2: 未決 → 次回会議へ持ち越し（carryover）
  await prisma.decisionItem.upsert({
    where: { id: D2 },
    update: { plannedMeetingId: M_NEXT },
    create: {
      id: D2,
      meetingId: M_CUR,
      title: "広報予算の上限を最終決定する",
      status: "open",
      decisionState: "open",
      reason: "information_lack",
      plannedMeetingId: M_NEXT,
    },
  });
  // D3: D1 に依存（blocks）
  await prisma.decisionItem.upsert({
    where: { id: D3 },
    update: { blockingItemId: D1 },
    create: {
      id: D3,
      meetingId: M_CUR,
      title: "ブランドガイドラインを更新する",
      status: "open",
      decisionState: "tentative",
      blockingItemId: D1,
    },
  });

  // 6. タスク
  // T1: D1 から派生（derives）
  await prisma.task.upsert({
    where: { id: T1 },
    update: {},
    create: {
      id: T1,
      organizationId: ORG_ID,
      originMeetingId: M_CUR,
      decisionItemId: D1,
      title: "全媒体のロゴ差し替え",
      status: "todo",
    },
  });
  // T2: 会議から直接発生（produces）
  await prisma.task.upsert({
    where: { id: T2 },
    update: {},
    create: {
      id: T2,
      organizationId: ORG_ID,
      originMeetingId: M_CUR,
      title: "関係部署へ周知",
      status: "in_progress",
    },
  });
  // T3: T2 に依存（blocks）
  await prisma.task.upsert({
    where: { id: T3 },
    update: { blockingItemId: T2 },
    create: {
      id: T3,
      organizationId: ORG_ID,
      originMeetingId: M_CUR,
      title: "公式サイトへ反映",
      status: "todo",
      blockingItemId: T2,
    },
  });

  // 7. 未決事項
  // A1: タスク T1 で解決（resolves）
  await prisma.ambiguousInfo.upsert({
    where: { id: A1 },
    update: {},
    create: {
      id: A1,
      meetingId: M_CUR,
      body: "ロゴ反映の担当者が未確定",
      status: "resolved",
      resolutionType: "task",
      resolvedToTaskId: T1,
    },
  });
  // A2: 決定 D1 で解決（resolves）
  await prisma.ambiguousInfo.upsert({
    where: { id: A2 },
    update: {},
    create: {
      id: A2,
      meetingId: M_CUR,
      body: "どのロゴ案にするか曖昧だった",
      status: "resolved",
      resolutionType: "decision_item",
      resolvedToDecisionItemId: D1,
    },
  });

  // 8. 次回議題（agenda）。requestedBy は必須なので先頭ユーザーを使う。
  if (users.length > 0) {
    await prisma.topicRequest.upsert({
      where: { id: TR1 },
      update: {},
      create: {
        id: TR1,
        meetingId: M_CUR,
        requestedBy: users[0].id,
        title: "次回までに競合ロゴを調査して共有する",
        priority: "required",
      },
    });
  }

  console.log("[seed] デモ意思決定グラフを投入しました。");
  console.log(`[seed] 今回会議の URL: /meetings/${M_CUR}/decision-graph`);
}

main()
  .catch((e) => {
    console.error("[seed] 失敗しました:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
