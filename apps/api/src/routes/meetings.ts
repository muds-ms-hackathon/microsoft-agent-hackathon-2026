import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
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
import { sendMeetingCreatedEvent } from "../lib/service-bus.js";
import { auth, type AuthVariables } from "../middleware/auth.js";

const createSchema = z.object({
  title: z.string().min(1),
  heldAt: z.string().datetime(),
});

// 既存 GET / と POST / は auth 未適用の公開エンドポイント（pre-existing）。
// 本ルーターには /:id/tasks のような認証必須パスを追加するため、
// Variables 型に AuthVariables を入れておく。auth ミドルウェアは新規エンドポイント側で
// 明示的に適用する（既存パスへは影響させない）。
export const meetingsRoute = new Hono<{ Variables: AuthVariables }>()
  .get("/", async (c) => {
    const meetings = await prisma.meeting.findMany({
      orderBy: { heldAt: "desc" },
    });
    return c.json(meetings);
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    const { title, heldAt } = c.req.valid("json");
    const meeting = await prisma.meeting.create({
      data: { title, heldAt: new Date(heldAt) },
    });
    // SB 送信はベストエフォート。失敗しても meeting は保存済みなので 201 を返す
    try {
      await sendMeetingCreatedEvent({
        meetingId: meeting.id,
        title: meeting.title,
      });
    } catch (err) {
      console.error(
        "[meetings] Service Bus 送信失敗 (meeting は保存済み):",
        err,
      );
    }
    return c.json(meeting, 201);
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
  );
