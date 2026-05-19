import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { prisma } from "../lib/prisma.js";
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
import { z } from "zod";
import { sendMeetingProcessEvent } from "../lib/service-bus.js";

// 旧 GET / と POST / は認証なしで叩ける状態だったため撤去した。
// Meeting 作成は POST /recurring-meetings/:id/meetings に一本化されている。
export const meetingsRoute = new Hono<{ Variables: AuthVariables }>()
  .get("/:id", auth, async (c) => {
    const id = c.req.param("id");
    // 会議 + 紐付く定例 + 組織を一度に取得する。単発会議（recurringMeetingId=null）は
    // 組織判定不能のため 404 で拒否する（/:id/tasks と同方針）。
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      include: {
        recurringMeeting: {
          include: {
            organization: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!meeting?.recurringMeeting) {
      return c.json({ error: "会議が見つかりません" }, 404);
    }

    const user = c.var.user;
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: meeting.recurringMeeting.organizationId,
        },
      },
    });
    if (!membership) {
      return c.json({ error: "会議が見つかりません" }, 404);
    }

    // 詳細レスポンス: meeting メタ + 紐付く recurringMeeting (id/name) + organization (id/name) の最小情報。
    // 議事録メタや解析結果は別 Issue で追加する想定なので、ここでは構造を保ったまま薄く返す。
    const { recurringMeeting, ...rest } = meeting;
    return c.json({
      ...rest,
      recurringMeeting: {
        id: recurringMeeting.id,
        name: recurringMeeting.name,
      },
      organization: recurringMeeting.organization,
    });
  })
  .get(
    "/:id/tasks",
    auth,
    zValidator("query", taskListQuerySchema),
    async (c) => {
      const id = c.req.param("id");
      const filters = c.req.valid("query");

      // 会議存在 + 紐付く定例経由で組織判定。単発会議（recurringMeetingId=null）は
      // 組織判定不能のため 404 で拒否する（MVP スコープ）。
      const meeting = await prisma.meeting.findUnique({
        where: { id },
        include: { recurringMeeting: { select: { organizationId: true } } },
      });
      if (!meeting?.recurringMeeting) {
        return c.json({ error: "会議が見つかりません" }, 404);
      }

      const user = c.var.user;
      const membership = await prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: meeting.recurringMeeting.organizationId,
          },
        },
      });
      if (!membership) {
        return c.json({ error: "会議が見つかりません" }, 404);
      }

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
    },
  )
  .post(
    "/:id/process",
    auth,
    zValidator("json", z.object({ transcript: z.string().min(1) })),
    async (c) => {
      const id = c.req.param("id");
      const { transcript } = c.req.valid("json");

      const meeting = await prisma.meeting.findUnique({
        where: { id },
        include: { recurringMeeting: { select: { organizationId: true } } },
      });
      if (!meeting?.recurringMeeting) {
        return c.json({ error: "会議が見つかりません" }, 404);
      }

      const user = c.var.user;
      const membership = await prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: meeting.recurringMeeting.organizationId,
          },
        },
      });
      if (!membership) {
        return c.json({ error: "会議が見つかりません" }, 404);
      }

      const analysisRun = await prisma.meetingAnalysisRun.create({
        data: {
          meetingId: id,
          status: "queued",
          triggerType: "manual",
          transcriptText: transcript,
        },
      });

      // SB通信はベストエフォート
      // 失敗しても analysis ruu は保存済みなので 201 を返す
      try {
        await sendMeetingProcessEvent({
          meetingId: id,
          analysisRunId: analysisRun.id,
          transcript,
        });
      } catch (err) {
        console.error(
          "[meetings] Service Bus 送信失敗 analysis run を failed に更新します:",
          err,
        );

        await prisma.meetingAnalysisRun.update({
          where: { id: analysisRun.id },
          data: {
            status: "failed",
            failedAt: new Date(),
            errorMessage: "Service Bus への送信に失敗しました",
          },
        });

        return c.json({ error: "解析ジョブの投入に失敗しました" }, 500);
      }

      return c.json(analysisRun, 201);
    },
  );
