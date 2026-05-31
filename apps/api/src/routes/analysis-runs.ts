import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

export const analysisRunsRoute = new Hono()
  // GET /:id/input — AI Service が解析に必要な情報を全て取得する
  .get("/:id/input", async (c) => {
    const id = c.req.param("id");

    const run = await prisma.meetingAnalysisRun.findUnique({
      where: { id },
      include: {
        meeting: {
          include: {
            speakers: true,
          },
        },
      },
    });

    if (!run) {
      return c.json({ error: "解析ランが見つかりません" }, 404);
    }

    const meeting = run.meeting;

    // 前回会議の最新完了済み解析ランの reportJson を取得する
    let previousReportJson: unknown = null;
    if (meeting.previousMeetingId) {
      const prevRun = await prisma.meetingAnalysisRun.findFirst({
        where: {
          meetingId: meeting.previousMeetingId,
          status: "completed",
        },
        orderBy: { createdAt: "desc" },
      });
      if (prevRun?.reportJson) {
        previousReportJson = prevRun.reportJson;
      }
    }

    // heldAt を "YYYY-MM-DD" 形式に変換する
    const meetingDate = meeting.heldAt.toISOString().split("T")[0];

    // 当該会議に紐づくユーザー入力議題。古い順で渡す（フェーズ2のプロンプト注入で
    // 順序保持が必要なため）。0 件のときは空配列で渡し、AI 側が必ずキーを取得できる状態を保つ。
    const topicRequests = await prisma.topicRequest.findMany({
      where: { meetingId: meeting.id },
      orderBy: { createdAt: "asc" },
      include: { requester: { select: { displayName: true } } },
    });

    return c.json({
      analysis_run_id: id,
      meeting_id: meeting.id,
      meeting_type: meeting.meetingType,
      transcription_quality: meeting.transcriptionQuality ?? "full",
      transcript: meeting.transcriptText,
      supplementary_memo: meeting.supplementaryMemo,
      meeting_date: meetingDate,
      recurring_meeting_id: meeting.recurringMeetingId,
      previous_meeting_id: meeting.previousMeetingId,
      speakers: meeting.speakers.map((s) => ({
        speaker_key: s.id,
        name: s.name,
        user_id: s.userId,
        resolution_status: s.resolutionStatus,
      })),
      previous_report_json: previousReportJson,
      user_topic_requests: topicRequests.map((tr) => ({
        title: tr.title,
        body: tr.body,
        priority: tr.priority,
        requested_by_name: tr.requester.displayName,
      })),
    });
  })
  // GET /:id/status — complete timeout 時などに AI Service が現在 status を確認する
  .get("/:id/status", async (c) => {
    const id = c.req.param("id");
    const run = await prisma.meetingAnalysisRun.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!run) {
      return c.json({ error: "解析ランが見つかりません" }, 404);
    }
    return c.json({ id: run.id, status: run.status });
  })
  // PATCH /:id/result — AI Service が解析結果を保存する
  .patch(
    "/:id/result",
    zValidator(
      "json",
      z.object({
        status: z.enum(["completed", "failed"]),
        current_step: z.string().nullable().optional(),
        report_json: z.any().optional(),
        raw_outputs_json: z.any().optional(),
        validation_warnings: z.array(z.any()).nullable().optional(),
        rag_retrieval_json: z.any().optional(),
        recommended_agenda: z.array(z.any()).nullable().optional(),
        summary: z.string().nullable().optional(),
        alert_level: z.enum(["high", "medium", "low"]).nullable().optional(),
        model_name: z.string().nullable().optional(),
        api_version: z.string().nullable().optional(),
        prompt_version: z.string().nullable().optional(),
        pipeline_version: z.string().nullable().optional(),
        input_hash: z.string().nullable().optional(),
        completed_at: z.string().nullable().optional(),
        failed_at: z.string().nullable().optional(),
        error_message: z.string().nullable().optional(),
      }),
    ),
    async (c) => {
      const id = c.req.param("id");
      const data = c.req.valid("json");

      const run = await prisma.meetingAnalysisRun.findUnique({
        where: { id },
      });
      if (!run) {
        return c.json({ error: "解析ランが見つかりません" }, 404);
      }

      // snake_case リクエストフィールドを camelCase DB カラムにマッピングする
      const updateData: Record<string, unknown> = {
        status: data.status,
      };
      if (data.current_step !== undefined)
        updateData.currentStep = data.current_step;
      if (data.report_json !== undefined)
        updateData.reportJson = data.report_json;
      if (data.raw_outputs_json !== undefined)
        updateData.rawOutputsJson = data.raw_outputs_json;
      if (data.validation_warnings !== undefined)
        updateData.validationWarnings = data.validation_warnings;
      if (data.rag_retrieval_json !== undefined)
        updateData.ragRetrievalJson = data.rag_retrieval_json;
      if (data.recommended_agenda !== undefined)
        updateData.recommendedAgenda = data.recommended_agenda;
      if (data.summary !== undefined) updateData.summary = data.summary;
      if (data.alert_level !== undefined)
        updateData.alertLevel = data.alert_level;
      if (data.model_name !== undefined) updateData.modelName = data.model_name;
      if (data.api_version !== undefined)
        updateData.apiVersion = data.api_version;
      if (data.prompt_version !== undefined)
        updateData.promptVersion = data.prompt_version;
      if (data.pipeline_version !== undefined)
        updateData.pipelineVersion = data.pipeline_version;
      if (data.input_hash !== undefined) updateData.inputHash = data.input_hash;
      if (data.completed_at !== undefined)
        updateData.completedAt = data.completed_at
          ? new Date(data.completed_at)
          : null;
      if (data.failed_at !== undefined)
        updateData.failedAt = data.failed_at ? new Date(data.failed_at) : null;
      if (data.error_message !== undefined)
        updateData.errorMessage = data.error_message;

      // 終端状態でない場合のみ更新する（CAS方式で並行競合を防ぐ）
      await prisma.meetingAnalysisRun.updateMany({
        where: {
          id,
          status: { notIn: ["completed", "failed"] },
        },
        data: updateData,
      });

      // 最新状態を取得して返す（更新件数0の場合も現状をそのまま返し冪等を保証）
      const currentRun = await prisma.meetingAnalysisRun.findUnique({
        where: { id },
      });
      return c.json(currentRun);
    },
  );
