import { afterEach, describe, expect, it, vi } from "vitest";

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
  afterEach(async () => {
    await closeServiceBus();
    vi.clearAllMocks();
  });

  it("(a) 初回呼び出しで ServiceBusClient と sender が新規作成される", async () => {
    await sendToServiceBus("conn-string", "test-queue", { key: "value" });

    expect(MockServiceBusClient).toHaveBeenCalledOnce();
    expect(MockServiceBusClient).toHaveBeenCalledWith("conn-string");
    expect(mockCreateSender).toHaveBeenCalledOnce();
    expect(mockCreateSender).toHaveBeenCalledWith("test-queue");
    expect(mockSendMessages).toHaveBeenCalledOnce();
  });

  it("(b) 2回目以降は既存の sender が再利用され、ServiceBusClient が新規作成されない", async () => {
    await sendToServiceBus("conn-string", "test-queue", { key: "first" });
    await sendToServiceBus("conn-string", "test-queue", { key: "second" });

    expect(MockServiceBusClient).toHaveBeenCalledOnce();
    expect(mockCreateSender).toHaveBeenCalledOnce();
    expect(mockSendMessages).toHaveBeenCalledTimes(2);
  });

  it("(c) closeServiceBus() 呼び出し後に sender と client の close が呼ばれる", async () => {
    await sendToServiceBus("conn-string", "test-queue", { key: "value" });
    vi.clearAllMocks();

    await closeServiceBus();

    expect(mockSenderClose).toHaveBeenCalledOnce();
    expect(mockClientClose).toHaveBeenCalledOnce();
  });

  it("(d) closeServiceBus() 後に再送信すると新しい client と sender が作成される", async () => {
    await sendToServiceBus("conn-string", "test-queue", { key: "before" });
    await closeServiceBus();
    vi.clearAllMocks();

    await sendToServiceBus("conn-string", "test-queue", { key: "after" });

    expect(MockServiceBusClient).toHaveBeenCalledOnce();
    expect(mockCreateSender).toHaveBeenCalledOnce();
    expect(mockSendMessages).toHaveBeenCalledOnce();
  });

  it("(e) afterEach で closeServiceBus() を呼ぶことで各テストは独立した状態から始まる", async () => {
    await sendToServiceBus("conn-string", "test-queue", { key: "value" });

    expect(MockServiceBusClient).toHaveBeenCalledOnce();
    expect(mockCreateSender).toHaveBeenCalledOnce();
  });
});
