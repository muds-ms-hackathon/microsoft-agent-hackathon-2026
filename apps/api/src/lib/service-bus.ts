import { ServiceBusClient, type ServiceBusSender } from "@azure/service-bus";
import { requireEnv } from "./env.js";

let client: ServiceBusClient | undefined;
let sender: ServiceBusSender | undefined;

// 初回呼び出し時に env から接続情報を取得して client / sender を生成する。
// 接続情報は起動中固定とする（実行時に切り替える要件は無いため）。
function getOrCreateSender(): ServiceBusSender {
  if (!sender) {
    const connectionString = requireEnv(
      "AZURE_SERVICE_BUS_CONNECTION_STRING",
      "",
    );
    if (!connectionString) {
      throw new Error("AZURE_SERVICE_BUS_CONNECTION_STRING が未設定です");
    }
    const queueName = requireEnv(
      "AZURE_SERVICE_BUS_QUEUE_NAME",
      "decision-loop",
    );
    client = new ServiceBusClient(connectionString);
    sender = client.createSender(queueName);
  }
  return sender;
}

/**
 * NOTE: このペイロードのスキーマは services/ai/main.py の
 * Service Bus メッセージ受信処理と対になっています。
 * フィールドを変更する場合は必ず両方を同時に更新してください。
 */
export async function sendToServiceBus(
  payload: Record<string, unknown>,
): Promise<void> {
  const s = getOrCreateSender();
  await s.sendMessages({
    body: JSON.stringify(payload),
    contentType: "application/json",
  });
}

export async function closeServiceBus(): Promise<void> {
  try {
    await sender?.close();
    await client?.close();
  } finally {
    sender = undefined;
    client = undefined;
  }
}
