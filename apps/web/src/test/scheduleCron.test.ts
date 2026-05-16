import { describe, expect, it } from "vitest";
import {
  buildCron,
  type CronBuilderState,
  describeCron,
  parseCron,
} from "../features/recurring-meetings/scheduleCron";

describe("buildCron", () => {
  it("毎日 10:00 は '0 10 * * *' を生成する", () => {
    const state: CronBuilderState = {
      frequency: "daily",
      weekdays: [],
      dayOfMonth: 1,
      hour: 10,
      minute: 0,
    };
    expect(buildCron(state)).toBe("0 10 * * *");
  });

  it("毎週月曜 10:00 は '0 10 * * 1' を生成する", () => {
    const state: CronBuilderState = {
      frequency: "weekly",
      weekdays: [1],
      dayOfMonth: 1,
      hour: 10,
      minute: 0,
    };
    expect(buildCron(state)).toBe("0 10 * * 1");
  });

  it("複数曜日は昇順カンマ区切りで出力される", () => {
    const state: CronBuilderState = {
      frequency: "weekly",
      weekdays: [3, 1, 5],
      dayOfMonth: 1,
      hour: 9,
      minute: 30,
    };
    expect(buildCron(state)).toBe("30 9 * * 1,3,5");
  });

  it("毎月 15 日 09:00 は '0 9 15 * *' を生成する", () => {
    const state: CronBuilderState = {
      frequency: "monthly",
      weekdays: [],
      dayOfMonth: 15,
      hour: 9,
      minute: 0,
    };
    expect(buildCron(state)).toBe("0 9 15 * *");
  });
});

describe("parseCron", () => {
  it("'0 10 * * *' は daily 10:00 として復元される", () => {
    expect(parseCron("0 10 * * *")).toEqual({
      frequency: "daily",
      weekdays: [],
      dayOfMonth: 1,
      hour: 10,
      minute: 0,
    });
  });

  it("'0 10 * * 1' は weekly 月曜 10:00 として復元される", () => {
    expect(parseCron("0 10 * * 1")).toEqual({
      frequency: "weekly",
      weekdays: [1],
      dayOfMonth: 1,
      hour: 10,
      minute: 0,
    });
  });

  it("'30 9 * * 1,3,5' は複数曜日として復元される", () => {
    expect(parseCron("30 9 * * 1,3,5")).toEqual({
      frequency: "weekly",
      weekdays: [1, 3, 5],
      dayOfMonth: 1,
      hour: 9,
      minute: 30,
    });
  });

  it("'0 9 15 * *' は monthly 15 日 09:00 として復元される", () => {
    expect(parseCron("0 9 15 * *")).toEqual({
      frequency: "monthly",
      weekdays: [],
      dayOfMonth: 15,
      hour: 9,
      minute: 0,
    });
  });

  it("範囲指定 '1-5' のような未対応形式は null を返す", () => {
    expect(parseCron("0 10 * * 1-5")).toBeNull();
  });

  it("ステップ指定 '*/15' のような未対応形式は null を返す", () => {
    expect(parseCron("*/15 * * * *")).toBeNull();
  });

  it("月指定は未対応として null を返す", () => {
    expect(parseCron("0 10 1 4 *")).toBeNull();
  });

  it("dom と dow の同時指定は null を返す", () => {
    expect(parseCron("0 10 1 * 1")).toBeNull();
  });

  it("フィールド数が 5 でない場合は null を返す", () => {
    expect(parseCron("0 10 * *")).toBeNull();
    expect(parseCron("0 10 * * * *")).toBeNull();
  });

  it("時刻範囲外は null を返す", () => {
    expect(parseCron("0 24 * * *")).toBeNull();
    expect(parseCron("60 10 * * *")).toBeNull();
  });
});

describe("describeCron", () => {
  it("毎日のプレビュー", () => {
    expect(
      describeCron({
        frequency: "daily",
        weekdays: [],
        dayOfMonth: 1,
        hour: 10,
        minute: 0,
      }),
    ).toBe("毎日 10:00");
  });

  it("毎週 単一曜日のプレビュー", () => {
    expect(
      describeCron({
        frequency: "weekly",
        weekdays: [1],
        dayOfMonth: 1,
        hour: 10,
        minute: 0,
      }),
    ).toBe("毎週 月 10:00");
  });

  it("毎週 複数曜日のプレビュー", () => {
    expect(
      describeCron({
        frequency: "weekly",
        weekdays: [5, 1, 3],
        dayOfMonth: 1,
        hour: 9,
        minute: 30,
      }),
    ).toBe("毎週 月・水・金 09:30");
  });

  it("毎月のプレビュー", () => {
    expect(
      describeCron({
        frequency: "monthly",
        weekdays: [],
        dayOfMonth: 15,
        hour: 9,
        minute: 0,
      }),
    ).toBe("毎月 15 日 09:00");
  });
});
