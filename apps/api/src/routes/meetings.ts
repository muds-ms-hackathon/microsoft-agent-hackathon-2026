import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { sendToServiceBus } from "../lib/service-bus.js";
import {
  buildDecisionItemListWhere,
  decisionItemListQuerySchema,
} from "../lib/schemas/decision-item.js";
import {
  buildAmbiguousInfoListWhere,
  ambiguousInfoListQuerySchema,
} from "../lib/schemas/ambiguous-info.js";
import {
  ambiguousInfoReviewInclude,
  decisionItemReviewInclude,
  serializeReviewItems,
  taskReviewInclude,
} from "../lib/review-item-serialization.js";
import {
  buildReviewItemStatusFilter,
  buildReviewItemTypeFilter,
  reviewItemCreateSchema,
  reviewItemQuerySchema,
} from "../lib/schemas/review-item.js";
import {
  buildTaskListWhere,
  taskListQuerySchema,
} from "../lib/schemas/task.js";
import { topicRequestCreateSchema } from "../lib/schemas/topic-request.js";
import {
  decisionItemListInclude,
  decisionItemListOrderBy,
} from "../lib/decision-item-serialization.js";
import {
  serializeTask,
  taskListInclude,
  taskListOrderBy,
} from "../lib/task-serialization.js";
import { buildDecisionGraph } from "../lib/decision-graph-serialization.js";
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
            _count: { select: { members: true } },
            members: {
              take: 4,
              orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
              include: {
                user: { select: { id: true, name: true, displayName: true } },
              },
            },
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
      memberCount: recurringMeeting._count.members,
      members: recurringMeeting.members.map((m) => ({
        userId: m.userId,
        role: m.role,
        user: {
          id: m.user.id,
          name: m.user.name,
          displayName: m.user.displayName,
        },
      })),
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
            recommendedAgenda: latestRun.recommendedAgenda,
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
      const {
        decisionItemStatusWhere,
        taskStatusWhere,
        ambiguousInfoStatusWhere,
      } = buildReviewItemStatusFilter(filters.status);

      const [decisionItems, tasks, ambiguousInfos] = await Promise.all([
        includeDecision
          ? prisma.decisionItem.findMany({
              where: {
                meetingId: id,
                ...decisionItemTypeWhere,
                ...decisionItemStatusWhere,
              },
              orderBy: { createdAt: "asc" },
              include: decisionItemReviewInclude,
            })
          : [],
        includeTasks
          ? prisma.task.findMany({
              where: {
                originMeetingId: id,
                ...taskStatusWhere,
              },
              orderBy: { createdAt: "asc" },
              include: taskReviewInclude,
            })
          : [],
        includeAmbiguousInfos
          ? prisma.ambiguousInfo.findMany({
              where: {
                meetingId: id,
                ...ambiguousInfoStatusWhere,
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
  .get("/:id/topic-requests", async (c) => {
    const id = c.req.param("id");
    const access = await requireMeetingAccess(c, id);
    if (!access.ok) return access.response;

    // 当該会議を「次回会議」として紐付く議題のみ。古い順で並べる
    // （会議当日にユーザーが追加した順で確認しやすい）。
    const topicRequests = await prisma.topicRequest.findMany({
      where: { meetingId: id },
      orderBy: { createdAt: "asc" },
    });
    return c.json(topicRequests);
  })
  .get("/:id/agenda-history", async (c) => {
    const id = c.req.param("id");
    const access = await requireMeetingAccess(c, id);
    if (!access.ok) return access.response;

    // 当該会議で過去に生成された推奨アジェンダの履歴。完了した解析ランのうち
    // recommendedAgenda を持つものを新しい順に返す（専用テーブルは設けず派生で扱う）。
    // JSON null のフィルタは取りこぼしを避けるため取得後に JS 側で行う。
    const runs = await prisma.meetingAnalysisRun.findMany({
      where: { meetingId: id, status: "completed" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        recommendedAgenda: true,
        createdAt: true,
        completedAt: true,
      },
    });
    const history = runs.filter(
      (r) => r.recommendedAgenda != null && r.recommendedAgenda !== undefined,
    );
    return c.json(history);
  })
  .post(
    "/:id/topic-requests",
    zValidator("json", topicRequestCreateSchema),
    async (c) => {
      const id = c.req.param("id");
      const input = c.req.valid("json");

      const access = await requireMeetingAccess(c, id);
      if (!access.ok) return access.response;

      // 認証済みユーザーを requestedBy とする。クライアントからの指定は受け付けない。
      const created = await prisma.topicRequest.create({
        data: {
          meetingId: id,
          requestedBy: c.var.user.id,
          title: input.title,
          body: input.body,
          priority: input.priority,
        },
      });
      return c.json(created, 201);
    },
  )
  .get(
    "/:id/decision-items",
    zValidator("query", decisionItemListQuerySchema),
    async (c) => {
      const id = c.req.param("id");
      const filters = c.req.valid("query");

      const access = await requireMeetingAccess(c, id);
      if (!access.ok) return access.response;

      const items = await prisma.decisionItem.findMany({
        where: { ...buildDecisionItemListWhere(filters), meetingId: id },
        orderBy: decisionItemListOrderBy,
        include: decisionItemListInclude,
      });
      return c.json(
        items.map(({ assignees, ...rest }) => ({
          ...rest,
          assignees: assignees.map((a) => a.user),
        })),
      );
    },
  )
  .get(
    "/:id/ambiguous-infos",
    zValidator("query", ambiguousInfoListQuerySchema),
    async (c) => {
      const id = c.req.param("id");
      const filters = c.req.valid("query");

      const access = await requireMeetingAccess(c, id);
      if (!access.ok) return access.response;

      const infos = await prisma.ambiguousInfo.findMany({
        where: {
          ...buildAmbiguousInfoListWhere(filters),
          meetingId: id,
        },
        orderBy: { updatedAt: "desc" },
      });
      return c.json(infos);
    },
  )
  .get("/:id/decision-graph", async (c) => {
    const id = c.req.param("id");

    const access = await requireMeetingAccess(c, id);
    if (!access.ok) return access.response;

    // 当該会議スコープで、来歴をたどるのに必要なノード素材を一括取得する。
    // 会議は前回/次回のチェーン、決定・タスク・未決・次回議題は当該会議に紐付くもの。
    const [meeting, decisionItems, tasks, ambiguousInfos, topicRequests] =
      await Promise.all([
        prisma.meeting.findUnique({
          where: { id },
          select: {
            id: true,
            title: true,
            heldAt: true,
            previousMeeting: { select: { id: true, title: true } },
            nextMeetings: { select: { id: true, title: true } },
          },
        }),
        prisma.decisionItem.findMany({
          where: { meetingId: id },
          select: {
            id: true,
            title: true,
            status: true,
            decisionState: true,
            blockingItemId: true,
            plannedMeeting: { select: { id: true, title: true } },
          },
        }),
        prisma.task.findMany({
          where: { originMeetingId: id },
          select: {
            id: true,
            title: true,
            status: true,
            decisionItemId: true,
            blockingItemId: true,
          },
        }),
        prisma.ambiguousInfo.findMany({
          where: { meetingId: id },
          select: {
            id: true,
            body: true,
            status: true,
            resolvedToTaskId: true,
            resolvedToDecisionItemId: true,
          },
        }),
        prisma.topicRequest.findMany({
          where: { meetingId: id },
          select: { id: true, title: true, priority: true },
        }),
      ]);

    // requireMeetingAccess 通過直後なので存在は保証されるが、型ナローイングのため再判定
    if (!meeting) {
      return c.json({ error: "会議が見つかりません" }, 404);
    }

    const graph = buildDecisionGraph({
      meeting,
      decisionItems,
      tasks,
      ambiguousInfos,
      topicRequests,
    });
    return c.json(graph);
  })
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
