import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  type AnalysisRunStatus,
  InvalidAnalysisRunTransitionError,
  transitionAnalysisRunStatus,
} from "../lib/analysis-run-state.js";
import { prisma } from "../lib/prisma.js";
import { analysisRunsRoute } from "./analysis-runs.js";

const decisionItemSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  sourceQuote: z.string().optional(),
});

const taskSchema = z.object({
  title: z.string(),
  body: z.string().optional(),
  sourceQuote: z.string().optional(),
  priority: z.enum(["required", "optional"]).optional(),
});

const ambiguousInfoSchema = z.object({
  body: z.string(),
  sourceQuote: z.string().optional(),
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

export const internalRoute = new Hono()
  .route("/analysis-runs", analysisRunsRoute)
  .patch(
    "/analysis-runs/:id",
    zValidator("json", z.object({ status: z.enum(["analyzing", "failed"]) })),
    async (c) => {
      const id = c.req.param("id");
      const { status } = c.req.valid("json");

      try {
        const outcome = await transitionAnalysisRunStatus(
          prisma,
          id,
          status as AnalysisRunStatus,
        );
        if (outcome.kind === "not_found") {
          return c.json({ error: "analysis run が見つかりません" }, 404);
        }
        if (outcome.kind === "conflict") {
          return c.json(
            { error: "ステータスが競合しました。再試行してください。" },
            409,
          );
        }
        // transitioned / noop どちらも最新レコードを返す
        const updated = await prisma.meetingAnalysisRun.findUnique({
          where: { id },
        });
        return c.json(updated);
      } catch (e) {
        if (e instanceof InvalidAnalysisRunTransitionError) {
          return c.json(
            { error: `${e.from} -> ${e.to} への遷移は許可されていません` },
            422,
          );
        }
        throw e;
      }
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

      // analyzing -> completed への遷移と結果保存をひとつの transaction に収める。
      try {
        const completeOutcome = await prisma.$transaction(async (tx) => {
          const outcome = await transitionAnalysisRunStatus(
            tx,
            id,
            "completed",
          );
          if (outcome.kind !== "transitioned") {
            // noop / conflict / not_found のときは create 系をスキップ
            return outcome;
          }
          if (decisionItems.length > 0) {
            await tx.decisionItem.createMany({
              data: decisionItems.map((item) => ({
                meetingId: run.meetingId,
                title: item.title,
                body: item.body,
                sourceQuote: item.sourceQuote,
                status: "draft",
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
                status: "draft",
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
                status: "draft",
                ambiguityType: info.ambiguityType ?? null,
                severity: info.severity ?? null,
              })),
            });
          }
          return outcome;
        });

        if (completeOutcome.kind === "conflict") {
          return c.json(
            {
              error: `analyzing 状態でないため complete できません: ${completeOutcome.current}`,
            },
            422,
          );
        }
        if (completeOutcome.kind === "not_found") {
          return c.json({ error: "analysis run が見つかりません" }, 404);
        }
        // noop / transitioned はいずれも { ok: true } で冪等に応答
      } catch (e) {
        if (e instanceof InvalidAnalysisRunTransitionError) {
          return c.json(
            { error: `${e.from} -> ${e.to} への遷移は許可されていません` },
            422,
          );
        }
        throw e;
      }

      return c.json({ ok: true });
    },
  );
