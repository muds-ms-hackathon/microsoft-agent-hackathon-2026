import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  type AnalysisRunStatus,
  type AnalysisRunUpdateExtras,
  InvalidAnalysisRunTransitionError,
  transitionAnalysisRunStatus,
} from "../lib/analysis-run-state.js";
import { prisma } from "../lib/prisma.js";
import { analysisRunsRoute } from "./analysis-runs.js";

// DateTime 文字列を Date に変換する。変換できない場合は null を返す。
function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Prisma nullable JSON 型への変換。null / undefined は DbNull（SQL NULL）にする。
function toJson(v: unknown): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue {
  if (v === null || v === undefined) return Prisma.DbNull;
  return v as Prisma.InputJsonValue;
}

const decisionItemSchema = z.object({
  title: z.string(),
  body: z.string().nullish(),
  source_quote: z.string().nullish(),
  source_context: z.string().nullish(),
  decision_state: z
    .enum(["confirmed", "tentative", "open"])
    .nullable()
    .catch(null)
    .optional(),
  reason: z
    .enum([
      "no_consensus",
      "information_lack",
      "intentional_defer",
      "not_discussed",
    ])
    .nullable()
    .catch(null)
    .optional(),
  recurrence_count: z.number().int().nullish(),
  decision_deadline: z.string().nullish(),
  ambiguity_flags: z.unknown().nullish(),
});

const taskSchema = z.object({
  title: z.string(),
  body: z.string().nullish(),
  source_quote: z.string().nullish(),
  source_context: z.string().nullish(),
  priority: z.enum(["required", "optional"]).nullable().catch(null).optional(),
  assignee_raw: z.string().nullish(),
  due_date_raw: z.string().nullish(),
  due_date: z.string().nullish(),
  due_date_estimated: z.boolean().nullish(),
  start_date: z.string().nullish(),
  follow_up_date: z.string().nullish(),
  carried_over_count: z.number().int().nullish(),
  ambiguity_flags: z.unknown().nullish(),
  progress_note: z.string().nullish(),
});

const ambiguousInfoSchema = z.object({
  body: z.string(),
  source_quote: z.string().nullish(),
  source_context: z.string().nullish(),
  ambiguity_type: z
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
    .nullable()
    .catch(null)
    .optional(),
  severity: z.enum(["high", "medium", "low"]).nullable().catch(null).optional(),
  inference_basis: z.string().nullish(),
  due_date_raw: z.string().nullish(),
  due_date_estimated: z.boolean().nullish(),
  affected_item_ids: z.unknown().nullish(),
});

const completePayloadSchema = z.object({
  summary: z.string().nullish(),
  alert_level: z.string().nullish(),
  model_name: z.string().nullish(),
  api_version: z.string().nullish(),
  prompt_version: z.string().nullish(),
  pipeline_version: z.string().nullish(),
  input_hash: z.string().nullish(),
  transcript_text: z.string().nullish(),
  report_json: z.unknown().nullish(),
  raw_outputs_json: z.unknown().nullish(),
  validation_warnings: z.array(z.unknown()).nullish(),
  rag_retrieval_json: z.unknown().nullish(),
  recommended_agenda: z.unknown().nullish(),
  resource_refs_json: z.unknown().nullish(),
  decision_items: z.array(decisionItemSchema).default([]),
  tasks: z.array(taskSchema).default([]),
  ambiguous_infos: z.array(ambiguousInfoSchema).default([]),
});

export const internalRoute = new Hono()
  .route("/analysis-runs", analysisRunsRoute)
  .patch(
    "/analysis-runs/:id",
    zValidator(
      "json",
      z.object({
        status: z.enum(["analyzing", "failed"]),
        error_message: z.string().optional(),
        current_step: z.string().optional(),
      }),
    ),
    async (c) => {
      const id = c.req.param("id");
      const { status, error_message, current_step } = c.req.valid("json");

      const extras: AnalysisRunUpdateExtras = {};
      if (error_message !== undefined) extras.errorMessage = error_message;
      if (current_step !== undefined) extras.currentStep = current_step;

      try {
        const outcome = await transitionAnalysisRunStatus(
          prisma,
          id,
          status as AnalysisRunStatus,
          Object.keys(extras).length > 0 ? extras : undefined,
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
    zValidator("json", completePayloadSchema),
    async (c) => {
      const id = c.req.param("id");
      const payload = c.req.valid("json");

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

      // snapshot フィールドを transitionAnalysisRunStatus の extras として渡す。
      // transitioned の場合のみ書き込まれるため、noop / conflict 時は影響なし。
      const snapshotExtras: AnalysisRunUpdateExtras = {
        summary: payload.summary ?? null,
        alertLevel: payload.alert_level ?? null,
        modelName: payload.model_name ?? null,
        apiVersion: payload.api_version ?? null,
        promptVersion: payload.prompt_version ?? null,
        pipelineVersion: payload.pipeline_version ?? null,
        inputHash: payload.input_hash ?? null,
        transcriptText: payload.transcript_text ?? null,
        reportJson: toJson(payload.report_json),
        rawOutputsJson: toJson(payload.raw_outputs_json),
        validationWarnings: toJson(payload.validation_warnings ?? null),
        ragRetrievalJson: toJson(payload.rag_retrieval_json),
        recommendedAgenda: toJson(payload.recommended_agenda),
        resourceRefsJson: toJson(payload.resource_refs_json),
      };

      try {
        const completeOutcome = await prisma.$transaction(async (tx) => {
          const outcome = await transitionAnalysisRunStatus(
            tx,
            id,
            "completed",
            snapshotExtras,
          );
          if (outcome.kind !== "transitioned") {
            // noop / conflict / not_found のときは業務データ作成をスキップ
            return outcome;
          }

          const { decision_items, tasks, ambiguous_infos } = payload;

          if (decision_items.length > 0) {
            await tx.decisionItem.createMany({
              data: decision_items.map((item) => ({
                meetingId: run.meetingId,
                title: item.title,
                body: item.body ?? null,
                sourceQuote: item.source_quote ?? null,
                sourceContext: item.source_context ?? null,
                status: "draft" as const,
                decisionState: item.decision_state ?? null,
                reason: item.reason ?? null,
                recurrenceCount: item.recurrence_count ?? null,
                decisionDeadline: toDate(item.decision_deadline),
                ambiguityFlags: toJson(item.ambiguity_flags),
              })),
            });
          }

          if (tasks.length > 0) {
            await tx.task.createMany({
              data: tasks.map((task) => ({
                organizationId,
                originMeetingId: run.meetingId,
                decisionItemId: null,
                title: task.title,
                body: task.body ?? null,
                sourceQuote: task.source_quote ?? null,
                sourceContext: task.source_context ?? null,
                status: "draft" as const,
                priority: task.priority ?? null,
                assigneeRaw: task.assignee_raw ?? null,
                dueDateRaw: task.due_date_raw ?? null,
                dueDate: toDate(task.due_date),
                dueDateEstimated: task.due_date_estimated ?? null,
                startDate: toDate(task.start_date),
                followUpDate: toDate(task.follow_up_date),
                carriedOverCount: task.carried_over_count ?? null,
                ambiguityFlags: toJson(task.ambiguity_flags),
                progressNote: task.progress_note ?? null,
              })),
            });
          }

          if (ambiguous_infos.length > 0) {
            await tx.ambiguousInfo.createMany({
              data: ambiguous_infos.map((info) => ({
                meetingId: run.meetingId,
                body: info.body,
                sourceQuote: info.source_quote ?? null,
                sourceContext: info.source_context ?? null,
                status: "draft" as const,
                ambiguityType: info.ambiguity_type ?? null,
                severity: info.severity ?? null,
                inferenceBasis: info.inference_basis ?? null,
                dueDateRaw: info.due_date_raw ?? null,
                dueDateEstimated: info.due_date_estimated ?? null,
                affectedItemIds: toJson(info.affected_item_ids),
              })),
            });
          }

          return outcome;
        });

        if (completeOutcome.kind === "conflict") {
          // 並行リクエストがすでに completed にした場合は冪等に 200 を返す
          if (completeOutcome.current === "completed") {
            return c.json({ ok: true });
          }
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
