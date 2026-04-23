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

meetingsRoute.post(
  "/",
  zValidator("json", createSchema),
  async (c) => {
    const { title, heldAt } = c.req.valid("json");
    const meeting = await prisma.meeting.create({
      data: { title, heldAt: new Date(heldAt) },
    });
    await sendMeetingCreatedEvent({ meetingId: meeting.id, title: meeting.title });
    return c.json(meeting, 201);
  },
);

export { meetingsRoute };
