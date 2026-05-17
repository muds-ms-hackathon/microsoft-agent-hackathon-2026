import { describe, expect, it } from "vitest";
import {
  createTaskFormSchema,
  updateTaskFormSchema,
} from "@/features/tasks/schemas";

describe("createTaskFormSchema", () => {
  it("最小入力（organizationId + title）が通る", () => {
    const result = createTaskFormSchema.safeParse({
      organizationId: "org-1",
      title: "資料作成",
    });
    expect(result.success).toBe(true);
  });

  it("organizationId が無いと失敗", () => {
    const result = createTaskFormSchema.safeParse({ title: "x" });
    expect(result.success).toBe(false);
  });

  it("title が空文字なら失敗", () => {
    const result = createTaskFormSchema.safeParse({
      organizationId: "org-1",
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("dueDate が ISO8601 でないと失敗", () => {
    const result = createTaskFormSchema.safeParse({
      organizationId: "org-1",
      title: "x",
      dueDate: "not-a-date",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateTaskFormSchema", () => {
  it("version + 1 フィールドで通る", () => {
    const result = updateTaskFormSchema.safeParse({
      version: 0,
      title: "更新後",
    });
    expect(result.success).toBe(true);
  });

  it("version のみ（他フィールド無し）は 400 同等で失敗", () => {
    const result = updateTaskFormSchema.safeParse({ version: 0 });
    expect(result.success).toBe(false);
  });

  it("version 欠落は失敗", () => {
    const result = updateTaskFormSchema.safeParse({ title: "x" });
    expect(result.success).toBe(false);
  });

  it("status=draft は手動経路で受け付けないので失敗", () => {
    const result = updateTaskFormSchema.safeParse({
      version: 0,
      status: "draft",
    });
    expect(result.success).toBe(false);
  });

  it("assigneeUserIds:[] は全削除として通る", () => {
    const result = updateTaskFormSchema.safeParse({
      version: 0,
      assigneeUserIds: [],
    });
    expect(result.success).toBe(true);
  });

  it("dueDate を null にする更新が通る", () => {
    const result = updateTaskFormSchema.safeParse({
      version: 0,
      dueDate: null,
    });
    expect(result.success).toBe(true);
  });
});
