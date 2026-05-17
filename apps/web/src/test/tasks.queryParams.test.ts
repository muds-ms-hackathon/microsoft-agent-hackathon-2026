import { describe, expect, it } from "vitest";
import { toTaskListQueryParams } from "@/features/tasks/hooks/useTasksQuery";

// クエリパラメータ整形は API 側仕様（status はカンマ区切り）に合わせる必要があり、
// hooks の URL 構築の前段ですべての分岐がここに集約される。純粋関数なので単独で検証する。
describe("toTaskListQueryParams", () => {
  it("undefined 入力で空オブジェクトを返す", () => {
    expect(toTaskListQueryParams(undefined)).toEqual({});
  });

  it("空 filters {} で空オブジェクトを返す", () => {
    expect(toTaskListQueryParams({})).toEqual({});
  });

  it("status は配列をカンマ区切り文字列に整形する", () => {
    expect(toTaskListQueryParams({ status: ["todo", "in_progress"] })).toEqual({
      status: "todo,in_progress",
    });
  });

  it("status が空配列のときは status キー自体を含めない", () => {
    // API 側で status が空ならフィルタなしと同義のため、URL に乗せない方が安全。
    expect(toTaskListQueryParams({ status: [] })).toEqual({});
  });

  it("assigneeId / dueBefore / dueAfter を含める", () => {
    expect(
      toTaskListQueryParams({
        assigneeId: "user-1",
        dueBefore: "2026-06-30T23:59:59Z",
        dueAfter: "2026-05-01T00:00:00Z",
      }),
    ).toEqual({
      assigneeId: "user-1",
      dueBefore: "2026-06-30T23:59:59Z",
      dueAfter: "2026-05-01T00:00:00Z",
    });
  });

  it("複数フィルタを同時に含められる", () => {
    expect(
      toTaskListQueryParams({
        status: ["todo"],
        assigneeId: "user-1",
        dueBefore: "2026-06-30T23:59:59Z",
      }),
    ).toEqual({
      status: "todo",
      assigneeId: "user-1",
      dueBefore: "2026-06-30T23:59:59Z",
    });
  });
});
