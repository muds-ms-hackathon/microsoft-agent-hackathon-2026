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

import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { sendMeetingCreatedEvent } from "../src/lib/service-bus.js";

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

describe("POST /meetings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("201 と作成した meeting を返す", async () => {
    mockCreate.mockResolvedValue(sampleMeeting);
    const res = await app.request("/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "週次定例",
        heldAt: "2026-04-23T10:00:00Z",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("cuid1");
    expect(mockCreate).toHaveBeenCalledWith({
      data: { title: "週次定例", heldAt: new Date("2026-04-23T10:00:00Z") },
    });
  });

  it("POST 成功時に Service Bus にイベントを送信する", async () => {
    mockCreate.mockResolvedValue(sampleMeeting);
    await app.request("/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "週次定例",
        heldAt: "2026-04-23T10:00:00Z",
      }),
    });
    expect(mockSend).toHaveBeenCalledWith({
      meetingId: "cuid1",
      title: "週次定例",
    });
  });

  it("title が空の場合は 400 を返す", async () => {
    const res = await app.request("/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", heldAt: "2026-04-23T10:00:00Z" }),
    });
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("heldAt が ISO 8601 でない場合は 400 を返す", async () => {
    const res = await app.request("/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "週次定例", heldAt: "not-a-date" }),
    });
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("Service Bus 送信失敗時も 201 を返す", async () => {
    mockCreate.mockResolvedValue(sampleMeeting);
    mockSend.mockRejectedValue(new Error("connection error"));
    const res = await app.request("/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "週次定例",
        heldAt: "2026-04-23T10:00:00Z",
      }),
    });
    expect(res.status).toBe(201);
  });
});
