import { ServiceBusClient, type ServiceBusSender } from "@azure/service-bus";

const QUEUE_NAME = "decision-loop";

let sender: ServiceBusSender | undefined;

function getOrCreateSender(connectionString: string): ServiceBusSender {
    sender ??= new ServiceBusClient(connectionString).createSender(QUEUE_NAME);
    return sender;
}

export async function sendMeetingProcessEvent(payload: {
    meetingId: string;
    analysisRunId: string;
    transcript: string;
}): Promise<void> {
    const connectionString = process.env.AZURE_SERVICE_BUS_CONNECTION_STRING;
    if (!connectionString) {
        console.log(
            "[service-bus] AZURE_SERVICE_BUS_CONNECTION_STRING 未設定のためスキップ",
        );
        return;
    }
    await getOrCreateSender(connectionString).sendMessages({
        body: { type: "meeting.process", ...payload },
    });
}