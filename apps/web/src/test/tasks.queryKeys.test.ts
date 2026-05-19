import { describe, expect, it } from "vitest";
import { taskQueryKeys } from "@/features/tasks/queryKeys";

// queryKey は mutation 後の invalidate 対象を決める基盤なので、
// タプル shape の typo / 順序ズレが起きないかを単純比較で守る。
describe("taskQueryKeys", () => {
  it("all は ['tasks']", () => {
    expect(taskQueryKeys.all).toEqual(["tasks"]);
  });

  it("me() は filters 省略時に空オブジェクトを含む", () => {
    expect(taskQueryKeys.me()).toEqual(["tasks", "me", {}]);
  });

  it("me(filters) は filters を末尾に含む", () => {
    expect(taskQueryKeys.me({ status: ["todo"] })).toEqual([
      "tasks",
      "me",
      { status: ["todo"] },
    ]);
  });

  it("org(orgId) は ['tasks', 'org', orgId, {}]", () => {
    expect(taskQueryKeys.org("org-1")).toEqual(["tasks", "org", "org-1", {}]);
  });

  it("recurring(rmId) は ['tasks', 'recurring', rmId, {}]", () => {
    expect(taskQueryKeys.recurring("rmtg-1")).toEqual([
      "tasks",
      "recurring",
      "rmtg-1",
      {},
    ]);
  });

  it("meeting(meetingId) は ['tasks', 'meeting', meetingId, {}]", () => {
    expect(taskQueryKeys.meeting("mtg-1")).toEqual([
      "tasks",
      "meeting",
      "mtg-1",
      {},
    ]);
  });

  it("detail(id) は ['tasks', 'detail', id]", () => {
    expect(taskQueryKeys.detail("task-1")).toEqual([
      "tasks",
      "detail",
      "task-1",
    ]);
  });
});
