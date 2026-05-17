import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type MeetingForSection,
  partitionMeetings,
} from "../features/recurring-meetings/meetingSections";

function meeting(id: string, heldAt: string): MeetingForSection {
  return { id, heldAt };
}

describe("partitionMeetings", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("未来は heldAt 昇順、過去は heldAt 降順で分割される", () => {
    const result = partitionMeetings([
      meeting("a", "2026-05-20T01:00:00Z"), // 未来
      meeting("b", "2026-05-10T01:00:00Z"), // 過去
      meeting("c", "2026-05-25T01:00:00Z"), // 未来（より遠い）
      meeting("d", "2026-05-15T01:00:00Z"), // 過去（より直近）
    ]);
    expect(result.upcoming.map((m) => m.id)).toEqual(["a", "c"]);
    expect(result.past.map((m) => m.id)).toEqual(["d", "b"]);
  });

  it("現在時刻ちょうど（heldAt === now）は upcoming に含める", () => {
    const result = partitionMeetings([
      meeting("now", "2026-05-17T00:00:00Z"),
      meeting("past", "2026-05-16T23:59:59Z"),
    ]);
    expect(result.upcoming.map((m) => m.id)).toEqual(["now"]);
    expect(result.past.map((m) => m.id)).toEqual(["past"]);
  });

  it("空配列は空の upcoming / past を返す", () => {
    const result = partitionMeetings([]);
    expect(result.upcoming).toEqual([]);
    expect(result.past).toEqual([]);
  });

  it("全件未来なら past は空、未来は昇順", () => {
    const result = partitionMeetings([
      meeting("c", "2026-06-01T00:00:00Z"),
      meeting("a", "2026-05-18T00:00:00Z"),
      meeting("b", "2026-05-25T00:00:00Z"),
    ]);
    expect(result.upcoming.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(result.past).toEqual([]);
  });

  it("全件過去なら upcoming は空、過去は降順", () => {
    const result = partitionMeetings([
      meeting("a", "2026-05-01T00:00:00Z"),
      meeting("c", "2026-05-15T00:00:00Z"),
      meeting("b", "2026-05-10T00:00:00Z"),
    ]);
    expect(result.past.map((m) => m.id)).toEqual(["c", "b", "a"]);
    expect(result.upcoming).toEqual([]);
  });
});
