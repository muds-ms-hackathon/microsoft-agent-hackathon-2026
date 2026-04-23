import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { sendMeetingCreatedEvent } from "../lib/service-bus.js";

const meetingsRoute = new Hono();

meetingsRoute.get("/", async (c) => {
  const meetings = await prisma.meeting.findMany({
    orderBy: { heldAt: "desc" },
  });
  return c.json(meetings);
});

const createSchema = z.object({
  title: z.string().min(1),
  heldAt: z.string().datetime(),
});

meetingsRoute.post("/", zValidator("json", createSchema), async (c) => {
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
    console.error("[meetings] Service Bus 送信失敗 (meeting は保存済み):", err);
  }
  return c.json(meeting, 201);
});

export { meetingsRoute };
