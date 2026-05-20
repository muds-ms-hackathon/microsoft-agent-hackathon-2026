import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const decisionItemSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  sourceQuote: z.string().optional(),
  status: z
    .enum(["draft", "reviewing", "open", "decided", "cancelled"])
    .default("open"),
});

const taskSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  sourceQuote: z.string().optional(),
  status: z
    .enum(["draft", "reviewing", "todo", "in_progress", "done", "rejected"])
    .default("todo"),
  priority: z.enum(["required", "optional"]).optional(),
});

const ambiguousInfoSchema = z.object({
  body: z.string(),
  sourceQuote: z.string().optional(),
  status: z
    .enum(["draft", "reviewing", "resolved", "rejected"])
    .default("draft"),
  ambiguityType: z
    .enum([
      "missing_speaker",
      "transcription_error_low",
      "transcription_error_high",
      "no_assignee",
      "no_deadline_mentioned",
      "no_deadline_absolute",
      "unclear_decision",
      "insufficient_basis",
      "unclear_scope",
    ])
    .optional(),
  severity: z.enum(["high", "medium", "low"]).optional(),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  queued: ["analyzing"],
  analyzing: ["failed"],
};

export const internalRoute = new Hono()
  .patch(
    "/analysis-runs/:id",
    zValidator("json", z.object({ status: z.enum(["analyzing", "failed"]) })),
    async (c) => {
      const id = c.req.param("id");
      const { status } = c.req.valid("json");

      const run = await prisma.meetingAnalysisRun.findUnique({ where: { id } });
      if (!run) {
        return c.json({ error: "analysis run が見つかりません" }, 404);
      }

      const allowed = VALID_TRANSITIONS[run.status] ?? [];
      if (!allowed.includes(status)) {
        return c.json(
          { error: `${run.status} -> ${status} への遷移は許可されていません` },
          422,
        );
      }

      const data: Record<string, unknown> = { status };
      if (status === "analyzing") data.startedAt = new Date();
      if (status === "failed") data.failedAt = new Date();

      const result = await prisma.meetingAnalysisRun.updateMany({
        where: { id, status: run.status },
        data,
      });
      if (result.count === 0) {
        return c.json(
          { error: "ステータスが競合しました。再試行してください。" },
          409,
        );
      }
      const updated = await prisma.meetingAnalysisRun.findUnique({
        where: { id },
      });
      return c.json(updated);
    },
  )
  .post(
    "/analysis-runs/:id/complete",
    zValidator(
      "json",
      z.object({
        decisionItems: z.array(decisionItemSchema).default([]),
        tasks: z.array(taskSchema).default([]),
        ambiguousInfos: z.array(ambiguousInfoSchema).default([]),
      }),
    ),
    async (c) => {
      const id = c.req.param("id");
      const { decisionItems, tasks, ambiguousInfos } = c.req.valid("json");

      const run = await prisma.meetingAnalysisRun.findUnique({
        where: { id },
        include: {
          meeting: {
            include: { recurringMeeting: { select: { organizationId: true } } },
          },
        },
      });
      if (!run) {
        return c.json({ error: "analysis run が見つかりません" }, 404);
      }

      const organizationId = run.meeting.recurringMeeting?.organizationId;
      if (!organizationId) {
        return c.json({ error: "組織情報が取得できません" }, 422);
      }

      // analyzing -> completed へのアトミックな遷移と結果保存をひとつの transaction に収める。
      try {
        await prisma.$transaction(async (tx) => {
          const claimed = await tx.meetingAnalysisRun.updateMany({
            where: { id, status: "analyzing" },
            data: { status: "completed", completedAt: new Date() },
          });

          if (claimed.count === 0) {
            const current = await tx.meetingAnalysisRun.findUnique({
              where: { id },
            });
            if (current?.status === "completed") {
              return; // 完了済みは冪等に 200 を返す
            }
            throw Object.assign(new Error("INVALID_STATUS"), {
              currentStatus: current?.status,
            });
          }

          if (decisionItems.length > 0) {
            await tx.decisionItem.createMany({
              data: decisionItems.map((item) => ({
                meetingId: run.meetingId,
                title: item.title,
                body: item.body,
                sourceQuote: item.sourceQuote,
                status: item.status,
              })),
            });
          }

          if (tasks.length > 0) {
            await tx.task.createMany({
              data: tasks.map((task) => ({
                organizationId,
                originMeetingId: run.meetingId,
                title: task.title,
                body: task.body,
                sourceQuote: task.sourceQuote,
                status: task.status,
                priority: task.priority ?? null,
              })),
            });
          }

          if (ambiguousInfos.length > 0) {
            await tx.ambiguousInfo.createMany({
              data: ambiguousInfos.map((info) => ({
                meetingId: run.meetingId,
                body: info.body,
                sourceQuote: info.sourceQuote,
                status: info.status,
                ambiguityType: info.ambiguityType ?? null,
                severity: info.severity ?? null,
              })),
            });
          }
        });
      } catch (e) {
        if (e instanceof Error && e.message === "INVALID_STATUS") {
          return c.json(
            {
              error: `analyzing 状態でないため complete できません: ${(e as { currentStatus?: string }).currentStatus}`,
            },
            422,
          );
        }
        throw e;
      }

      return c.json({ ok: true });
    },
  );