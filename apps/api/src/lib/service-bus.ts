import { ServiceBusClient } from "@azure/service-bus";

const QUEUE_NAME = "decision-loop";

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

  const client = new ServiceBusClient(connectionString);
  const sender = client.createSender(QUEUE_NAME);
  try {
    await sender.sendMessages({
      body: { type: "meeting.created", ...payload },
    });
  } finally {
    await sender.close();
    await client.close();
  }
}
