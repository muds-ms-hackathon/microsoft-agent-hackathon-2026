import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DB と Service Bus をモックしてルートロジックのみを検証する
vi.mock("../src/lib/prisma.js", () => ({
  prisma: {
    meeting: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("../src/lib/service-bus.js", () => ({
  sendMeetingCreatedEvent: vi.fn(),
}));

import { prisma } from "../src/lib/prisma.js";
import { sendMeetingCreatedEvent } from "../src/lib/service-bus.js";
import { app } from "../src/app.js";

const mockFindMany = vi.mocked(prisma.meeting.findMany);
const mockCreate = vi.mocked(prisma.meeting.create);
const mockSend = vi.mocked(sendMeetingCreatedEvent);

const sampleMeeting = {
  id: "cuid1",
  title: "週次定例",
  heldAt: new Date("2026-04-23T10:00:00Z"),
  createdAt: new Date("2026-04-23T09:00:00Z"),
};

describe("GET /meetings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("200 と meetings 配列を返す", async () => {
    mockFindMany.mockResolvedValue([sampleMeeting]);
    const res = await app.request("/meetings");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("cuid1");
    expect(mockFindMany).toHaveBeenCalledWith({
      orderBy: { heldAt: "desc" },
    });
  });

  it("meetings がない場合は空配列を返す", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await app.request("/meetings");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});
