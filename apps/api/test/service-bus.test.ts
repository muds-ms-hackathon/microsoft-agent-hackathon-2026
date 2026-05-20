import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  MockServiceBusClient,
  mockCreateSender,
  mockSendMessages,
  mockSenderClose,
  mockClientClose,
} = vi.hoisted(() => {
  const mockSenderClose = vi.fn().mockResolvedValue(undefined);
  const mockSendMessages = vi.fn().mockResolvedValue(undefined);
  const mockClientClose = vi.fn().mockResolvedValue(undefined);
  const mockCreateSender = vi.fn().mockReturnValue({
    sendMessages: mockSendMessages,
    close: mockSenderClose,
  });
  const MockServiceBusClient = vi.fn().mockImplementation(() => ({
    createSender: mockCreateSender,
    close: mockClientClose,
  }));
  return {
    MockServiceBusClient,
    mockCreateSender,
    mockSendMessages,
    mockSenderClose,
    mockClientClose,
  };
});

vi.mock("@azure/service-bus", () => ({
  ServiceBusClient: MockServiceBusClient,
}));

import { closeServiceBus, sendToServiceBus } from "../src/lib/service-bus.js";

describe("service-bus", () => {
  beforeEach(() => {
    vi.stubEnv("AZURE_SERVICE_BUS_CONNECTION_STRING", "conn-string");
    vi.stubEnv("AZURE_SERVICE_BUS_QUEUE_NAME", "test-queue");
  });

  afterEach(async () => {
    await closeServiceBus();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("(a) 初回呼び出しで env から接続情報を読んで ServiceBusClient と sender を生成する", async () => {
    await sendToServiceBus({ key: "value" });

    expect(MockServiceBusClient).toHaveBeenCalledOnce();
    expect(MockServiceBusClient).toHaveBeenCalledWith("conn-string");
    expect(mockCreateSender).toHaveBeenCalledOnce();
    expect(mockCreateSender).toHaveBeenCalledWith("test-queue");
    expect(mockSendMessages).toHaveBeenCalledOnce();
  });

  it("(b) 2回目以降は既存の client / sender を再利用する", async () => {
    await sendToServiceBus({ key: "first" });
    await sendToServiceBus({ key: "second" });

    expect(MockServiceBusClient).toHaveBeenCalledOnce();
    expect(mockCreateSender).toHaveBeenCalledOnce();
    expect(mockSendMessages).toHaveBeenCalledTimes(2);
  });

  it("(c) closeServiceBus() で sender と client の close が呼ばれる", async () => {
    await sendToServiceBus({ key: "value" });
    vi.clearAllMocks();

    await closeServiceBus();

    expect(mockSenderClose).toHaveBeenCalledOnce();
    expect(mockClientClose).toHaveBeenCalledOnce();
  });

  it("(d) closeServiceBus() 後に再送信すると新しい client と sender が作成される", async () => {
    await sendToServiceBus({ key: "before" });
    await closeServiceBus();
    vi.clearAllMocks();

    await sendToServiceBus({ key: "after" });

    expect(MockServiceBusClient).toHaveBeenCalledOnce();
    expect(mockCreateSender).toHaveBeenCalledOnce();
    expect(mockSendMessages).toHaveBeenCalledOnce();
  });

  it("(e) AZURE_SERVICE_BUS_CONNECTION_STRING 未設定なら明示的に throw する", async () => {
    vi.stubEnv("AZURE_SERVICE_BUS_CONNECTION_STRING", "");

    await expect(sendToServiceBus({ key: "value" })).rejects.toThrowError(
      /AZURE_SERVICE_BUS_CONNECTION_STRING/,
    );
    expect(MockServiceBusClient).not.toHaveBeenCalled();
  });

  it("(f) AZURE_SERVICE_BUS_QUEUE_NAME 未設定なら decision-loop にフォールバックする", async () => {
    vi.stubEnv("AZURE_SERVICE_BUS_QUEUE_NAME", "");

    await sendToServiceBus({ key: "value" });

    expect(mockCreateSender).toHaveBeenCalledWith("decision-loop");
  });
});
