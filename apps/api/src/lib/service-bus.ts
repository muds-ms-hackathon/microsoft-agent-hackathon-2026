import { ServiceBusClient, type ServiceBusSender } from "@azure/service-bus";

let client: ServiceBusClient | undefined;
let sender: ServiceBusSender | undefined;

function getOrCreateSender(
  connectionString: string,
  queueName: string,
): ServiceBusSender {
  if (!sender) {
    client = new ServiceBusClient(connectionString);
    sender = client.createSender(queueName);
  }
  return sender;
}

export async function sendToServiceBus(
  connectionString: string,
  queueName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const s = getOrCreateSender(connectionString, queueName);
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
