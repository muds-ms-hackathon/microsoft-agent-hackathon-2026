import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { sendToServiceBus } from "../lib/service-bus.js";
import {
  ambiguousInfoReviewInclude,
  decisionItemReviewInclude,
  serializeReviewItems,
  taskReviewInclude,
} from "../lib/review-item-serialization.js";
import {
  buildReviewItemTypeFilter,
  reviewItemCreateSchema,
  reviewItemQuerySchema,
} from "../lib/schemas/review-item.js";
import {
  buildTaskListWhere,
  taskListQuerySchema,
} from "../lib/schemas/task.js";
import {
  serializeTask,
  taskListInclude,
  taskListOrderBy,
} from "../lib/task-serialization.js";
import { auth, type AuthVariables } from "../middleware/auth.js";
import { requireMeetingAccess } from "../middleware/meeting-access.js";

// 会議メタ情報の更新スキーマ。transcriptText を中心に議事録関連フィールドを受け付ける。
// 全フィールド optional だが、いずれか 1 つ以上の指定を必須とする。
const meetingUpdateSchema = z
  .object({
    transcriptText: z.string().nullable().optional(),
    supplementaryMemo: z.string().nullable().optional(),
    meetingType: z.string().optional(),
    transcriptionQuality: z.string().nullable().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.transcriptText !== undefined ||
      d.supplementaryMemo !== undefined ||
      d.meetingType !== undefined ||
      d.transcriptionQuality !== undefined,
    { message: "更新する項目を 1 つ以上指定してください" },
  );

// 旧 GET / と POST /meetings は認証なしで叩ける状態だったため撤去した。
// Meeting 作成は POST /recurring-meetings/:id/meetings に一本化されている。
export const meetingsRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", auth)
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    // 認可検証は共通ヘルパーで実施。GET /:id は追加情報が必要なため、
    // 認可確定後に detail include 付きで再フェッチする。
    const access = await requireMeetingAccess(c, id);
    if (!access.ok) return access.response;

    const detail = await prisma.meeting.findUnique({
      where: { id },
      include: {
        recurringMeeting: {
          include: {
            organization: { select: { id: true, name: true } },
          },
        },
        // 解析ラン最新 1 件をポーリング用に含める
        analysisRuns: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    // requireMeetingAccess 通過直後なので存在は保証されるが、型ナローイングのため再判定
    if (!detail?.recurringMeeting) {
      return c.json({ error: "会議が見つかりません" }, 404);
    }

    const { recurringMeeting, analysisRuns, ...rest } = detail;
    const latestRun = analysisRuns[0] ?? null;

    return c.json({
      ...rest,
      recurringMeeting: {
        id: recurringMeeting.id,
        name: recurringMeeting.name,
      },
      organization: recurringMeeting.organization,
      latestAnalysisRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            currentStep: latestRun.currentStep,
            summary: latestRun.summary,
            alertLevel: latestRun.alertLevel,
            completedAt: latestRun.completedAt,
            failedAt: latestRun.failedAt,
            errorMessage: latestRun.errorMessage,
          }
        : null,
    });
  })
  .get("/:id/tasks", zValidator("query", taskListQuerySchema), async (c) => {
    const id = c.req.param("id");
    const filters = c.req.valid("query");

    const access = await requireMeetingAccess(c, id);
    if (!access.ok) return access.response;

    // 当該会議を発生源とするタスクのみ。
    const tasks = await prisma.task.findMany({
      where: {
        ...buildTaskListWhere(filters),
        originMeetingId: id,
      },
      orderBy: taskListOrderBy,
      include: taskListInclude,
    });
    return c.json(tasks.map(serializeTask));
  })
  .get(
    "/:id/review-items",
    zValidator("query", reviewItemQuerySchema),
    async (c) => {
      const id = c.req.param("id");
      const filters = c.req.valid("query");

      const access = await requireMeetingAccess(c, id);
      if (!access.ok) return access.response;

      const {
        includeDecision,
        includeTasks,
        includeAmbiguousInfos,
        decisionItemTypeWhere,
      } = buildReviewItemTypeFilter(filters.type);

      const [decisionItems, tasks, ambiguousInfos] = await Promise.all([
        includeDecision
          ? prisma.decisionItem.findMany({
              where: {
                meetingId: id,
                status: { in: ["draft", "reviewing"] },
                ...decisionItemTypeWhere,
              },
              orderBy: { createdAt: "asc" },
              include: decisionItemReviewInclude,
            })
          : [],
        includeTasks
          ? prisma.task.findMany({
              where: {
                originMeetingId: id,
                status: { in: ["draft", "reviewing"] },
              },
              orderBy: { createdAt: "asc" },
              include: taskReviewInclude,
            })
          : [],
        includeAmbiguousInfos
          ? prisma.ambiguousInfo.findMany({
              where: {
                meetingId: id,
                status: { in: ["draft", "reviewing"] },
              },
              orderBy: { createdAt: "asc" },
              include: ambiguousInfoReviewInclude,
            })
          : [],
      ]);

      return c.json(
        serializeReviewItems({ decisionItems, tasks, ambiguousInfos }),
      );
    },
  )
  // TODO: 動作確認用のため削除する
  .post(
    "/:id/review-items",
    zValidator("json", reviewItemCreateSchema),
    async (c) => {
      const id = c.req.param("id");
      const input = c.req.valid("json");

      const access = await requireMeetingAccess(c, id);
      if (!access.ok) return access.response;

      const { organizationId } = access.meeting.recurringMeeting;

      if (input.type === "task_candidate") {
        const task = await prisma.task.create({
          data: {
            organizationId,
            title: input.title,
            body: input.body,
            sourceContext: input.sourceContext,
            status: "draft",
            originMeetingId: id,
          },
          select: { id: true, title: true, status: true },
        });
        return c.json(task, 201);
      }

      if (input.type === "ambiguity") {
        const item = await prisma.ambiguousInfo.create({
          data: {
            meetingId: id,
            body: input.title,
            sourceContext: input.sourceContext,
            status: "draft",
          },
          select: { id: true, body: true, status: true },
        });
        return c.json(item, 201);
      }

      // decision / open_issue → DecisionItem
      const decisionState =
        input.type === "decision" ? ("confirmed" as const) : ("open" as const);
      const item = await prisma.decisionItem.create({
        data: {
          meetingId: id,
          title: input.title,
          body: input.body,
          sourceContext: input.sourceContext,
          status: "draft",
          decisionState,
        },
        select: { id: true, title: true, status: true, decisionState: true },
      });
      return c.json(item, 201);
    },
  )
  .patch("/:id", zValidator("json", meetingUpdateSchema), async (c) => {
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const access = await requireMeetingAccess(c, id);
    if (!access.ok) return access.response;

    // undefined フィールドを除外して更新データを構築する
    const updateData: Record<string, unknown> = {};
    if (data.transcriptText !== undefined)
      updateData.transcriptText = data.transcriptText;
    if (data.supplementaryMemo !== undefined)
      updateData.supplementaryMemo = data.supplementaryMemo;
    if (data.meetingType !== undefined)
      updateData.meetingType = data.meetingType;
    if (data.transcriptionQuality !== undefined)
      updateData.transcriptionQuality = data.transcriptionQuality;

    const updated = await prisma.meeting.update({
      where: { id },
      data: updateData,
    });
    return c.json(updated);
  })
  .post("/:id/analyze", async (c) => {
    const id = c.req.param("id");

    const access = await requireMeetingAccess(c, id);
    if (!access.ok) return access.response;

    // 文字起こしテキスト未設定は解析不可
    if (!access.meeting.transcriptText) {
      return c.json({ error: "文字起こしテキストが設定されていません" }, 400);
    }

    // 処理中（queued / analyzing）の解析ランが既に存在する場合は 409 を返す
    const inFlightRun = await prisma.meetingAnalysisRun.findFirst({
      where: {
        meetingId: id,
        status: { in: ["queued", "analyzing"] },
      },
    });
    if (inFlightRun) {
      return c.json({ error: "処理中の解析ジョブが既に存在します" }, 409);
    }

    // 解析ランを queued 状態で作成する
    const run = await prisma.meetingAnalysisRun.create({
      data: {
        meetingId: id,
        status: "queued",
        triggerType: "manual",
      },
    });

    // AI Service に解析を依頼するメッセージを Service Bus に送信する。
    // 接続情報は service-bus モジュール内部で env から取得する。
    try {
      await sendToServiceBus({
        analysis_run_id: run.id,
        meeting_id: id,
        trigger_type: "transcript_submitted",
      });
    } catch (sbErr) {
      console.error("[meetings] Service Bus 送信失敗 run=%s:", run.id, sbErr);
      try {
        // queued -> failed は VALID_TRANSITIONS には含めず、内部経路として
        // 直接更新する（外部 API では queued -> failed を許可しない）
        await prisma.meetingAnalysisRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            failedAt: new Date(),
            errorMessage: String(sbErr),
          },
        });
      } catch (dbErr) {
        console.error("[meetings] failed 更新も失敗 run=%s:", run.id, dbErr);
      }
      return c.json({ error: "解析ジョブの投入に失敗しました" }, 500);
    }

    return c.json({ analysisRunId: run.id, status: "queued" }, 202);
  });
