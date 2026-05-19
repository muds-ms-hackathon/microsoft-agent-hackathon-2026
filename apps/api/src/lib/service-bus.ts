import { ServiceBusClient } from "@azure/service-bus";

// Service Busキューへメッセージを送信する。呼び出しごとにクライアントを生成・破棄する。
export async function sendToServiceBus(
  connectionString: string,
  queueName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const client = new ServiceBusClient(connectionString);
  const sender = client.createSender(queueName);
  try {
    await sender.sendMessages({
      body: JSON.stringify(payload),
      contentType: "application/json",
    });
  } finally {
    await sender.close();
    await client.close();
  }
}
