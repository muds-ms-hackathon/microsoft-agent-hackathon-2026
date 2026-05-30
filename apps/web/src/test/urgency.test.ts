import { describe, expect, it } from "vitest";
import type { TaskListItem } from "@/features/tasks/types";
import {
  calcUrgency,
  formatDeadline,
  summarizeReminders,
} from "@/features/tasks/urgency";

// 基準時刻を固定してタイムゾーン非依存にする（fake timer は使わない）。
const NOW = new Date("2026-06-15T09:00:00.000Z");

// TZ オフセット（最大±14h）でも日境界が 7 日窓を跨がない余裕を持った日付を使う。
const OVERDUE = "2026-05-15T12:00:00.000Z"; // 約1ヶ月前
const THIS_WEEK = "2026-06-17T12:00:00.000Z"; // 2日後
const LATER = "2026-07-20T12:00:00.000Z"; // 1ヶ月以上先

function makeTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: "task-1",
    organizationId: "org-1",
    originMeetingId: null,
    decisionItemId: null,
    title: "テストタスク",
    body: null,
    sourceQuote: null,
    sourceContext: null,
    status: "todo",
    priority: null,
    dueDateRaw: null,
    dueDateEstimated: null,
    assigneeRaw: null,
    blockingItemId: null,
    carriedOverCount: null,
    ambiguityFlags: null,
    progressNote: null,
    dueDate: null,
    startDate: null,
    followUpDate: null,
    version: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    organization: { id: "org-1", name: "ACME" },
    originMeeting: null,
    assignees: [],
    recurringMeetings: [],
    ...overrides,
  };
}

describe("calcUrgency", () => {
  it("期限なしは later", () => {
    expect(calcUrgency(null, NOW)).toBe("later");
  });

  it("過去の期限は overdue", () => {
    expect(calcUrgency(OVERDUE, NOW)).toBe("overdue");
  });

  it("今日から7日以内は this-week", () => {
    expect(calcUrgency(THIS_WEEK, NOW)).toBe("this-week");
  });

  it("7日より先は later", () => {
    expect(calcUrgency(LATER, NOW)).toBe("later");
  });
});

describe("formatDeadline", () => {
  it("期限なしは「未設定」", () => {
    expect(formatDeadline(null, "later", NOW)).toBe("未設定");
  });

  it("超過は「N日超過」", () => {
    expect(formatDeadline(OVERDUE, "overdue", NOW)).toMatch(/日超過$/);
  });

  it("超過以外は「月/日」形式", () => {
    expect(formatDeadline(THIS_WEEK, "this-week", NOW)).toBe("6/17");
  });
});

describe("summarizeReminders", () => {
  it("空配列は全件 0", () => {
    expect(summarizeReminders([], NOW)).toEqual({
      overdue: 0,
      dueSoon: 0,
      startOverdue: 0,
      unread: 0,
    });
  });

  it("期限超過・今週・着手超過・未読をそれぞれ集計する", () => {
    const tasks = [
      makeTask({ id: "a", dueDate: OVERDUE }),
      makeTask({ id: "b", dueDate: THIS_WEEK }),
      makeTask({ id: "c", startDate: OVERDUE, status: "todo" }),
      makeTask({ id: "d", unread: true }),
    ];
    expect(summarizeReminders(tasks, NOW)).toEqual({
      overdue: 1,
      dueSoon: 1,
      startOverdue: 1,
      unread: 1,
    });
  });

  it("着手予定日超過は status=todo のみカウントし、着手済み(in_progress)は除外する", () => {
    const tasks = [
      makeTask({ id: "a", startDate: OVERDUE, status: "in_progress" }),
    ];
    expect(summarizeReminders(tasks, NOW).startOverdue).toBe(0);
  });

  it("1件が複数条件に該当する場合は各カテゴリで重複カウントする", () => {
    const tasks = [makeTask({ id: "a", dueDate: OVERDUE, unread: true })];
    const summary = summarizeReminders(tasks, NOW);
    expect(summary.overdue).toBe(1);
    expect(summary.unread).toBe(1);
  });
});
