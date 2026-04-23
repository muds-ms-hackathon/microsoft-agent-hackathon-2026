import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendMeetingCreatedEvent } from "../src/lib/service-bus.js";

const mockSendMessages = vi.fn();
const mockSenderClose = vi.fn();
const mockClientClose = vi.fn();

vi.mock("@azure/service-bus", () => ({
  ServiceBusClient: vi.fn().mockImplementation(() => ({
    createSender: vi.fn().mockReturnValue({
      sendMessages: mockSendMessages,
      close: mockSenderClose,
    }),
    close: mockClientClose,
  })),
}));

describe("sendMeetingCreatedEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
  });

  it("接続文字列未設定時はスキップしてログ出力のみ", async () => {
    const consoleSpy = vi.spyOn(console, "log");
    await sendMeetingCreatedEvent({ meetingId: "id1", title: "定例" });
    expect(mockSendMessages).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("AZURE_SERVICE_BUS_CONNECTION_STRING"),
    );
  });

  it("接続文字列が設定されている場合は送信する", async () => {
    process.env.AZURE_SERVICE_BUS_CONNECTION_STRING = "Endpoint=sb://test/";
    await sendMeetingCreatedEvent({ meetingId: "id1", title: "定例" });
    expect(mockSendMessages).toHaveBeenCalledWith({
      body: { type: "meeting.created", meetingId: "id1", title: "定例" },
    });
    expect(mockSenderClose).toHaveBeenCalled();
    expect(mockClientClose).toHaveBeenCalled();
  });
});
