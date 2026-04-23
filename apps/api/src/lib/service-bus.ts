import { ServiceBusClient, type ServiceBusSender } from "@azure/service-bus";

const QUEUE_NAME = "decision-loop";

// AMQP 接続確立コストを避けるため、センダーをモジュールスコープでキャッシュする
let sender: ServiceBusSender | undefined;

function getOrCreateSender(connectionString: string): ServiceBusSender {
  sender ??= new ServiceBusClient(connectionString).createSender(QUEUE_NAME);
  return sender;
}

export async function sendMeetingCreatedEvent(payload: {
  meetingId: string;
  title: string;
}): Promise<void> {
  const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
  if (!connectionString) {
    console.log(
      "[service-bus] AZURE_SERVICE_BUS_CONNECTION_STRING 未設定のためスキップ",
    );
    return;
  }
  await getOrCreateSender(connectionString).sendMessages({
    body: { type: "meeting.created", ...payload },
  });
}
