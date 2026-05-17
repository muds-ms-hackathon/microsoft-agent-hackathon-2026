import { describe, expect, it } from "vitest";
import {
  ambiguityTypeLabels,
  resolutionTypeLabels,
  taskPriorityLabels,
  taskStatusLabels,
} from "@/features/tasks/labels";
import type {
  AmbiguityType,
  ResolutionType,
  TaskPriority,
  TaskStatus,
} from "@/features/tasks/types";

// enum 値を将来追加した際、ラベル定義漏れで UI が undefined 表示になる事故を防ぐ。
// satisfies で「全キーが網羅されている Record か」を型と値の両面で検証する。
describe("ラベル定義の完全性", () => {
  it("taskStatusLabels に全 TaskStatus がある", () => {
    const allStatuses: TaskStatus[] = [
      "draft",
      "reviewing",
      "todo",
      "in_progress",
      "done",
      "rejected",
    ];
    for (const s of allStatuses) {
      expect(taskStatusLabels[s]).toBeTruthy();
    }
    expect(Object.keys(taskStatusLabels).sort()).toEqual(
      [...allStatuses].sort(),
    );
  });

  it("taskPriorityLabels に全 TaskPriority がある", () => {
    const all: TaskPriority[] = ["required", "optional"];
    for (const p of all) {
      expect(taskPriorityLabels[p]).toBeTruthy();
    }
    expect(Object.keys(taskPriorityLabels).sort()).toEqual([...all].sort());
  });

  it("ambiguityTypeLabels に全 AmbiguityType がある", () => {
    const all: AmbiguityType[] = [
      "missing_speaker",
      "transcription_error_low",
      "transcription_error_high",
      "no_assignee",
      "no_deadline_mentioned",
      "no_deadline_absolute",
      "unclear_decision",
      "insufficient_basis",
      "unclear_scope",
    ];
    for (const t of all) {
      expect(ambiguityTypeLabels[t]).toBeTruthy();
    }
    expect(Object.keys(ambiguityTypeLabels).sort()).toEqual([...all].sort());
  });

  it("resolutionTypeLabels に全 ResolutionType がある", () => {
    const all: ResolutionType[] = ["task", "decision_item", "discarded"];
    for (const r of all) {
      expect(resolutionTypeLabels[r]).toBeTruthy();
    }
    expect(Object.keys(resolutionTypeLabels).sort()).toEqual([...all].sort());
  });
});
