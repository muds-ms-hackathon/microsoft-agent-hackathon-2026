import { api } from "@/lib/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

export const Route = createFileRoute("/")({
  component: Index,
});

// ===== 型定義 =====

type Meeting = {
  id: string;
  title: string;
  heldAt: string;
  createdAt: string;
};

// ===== meetings 一覧 =====

function MeetingsList() {
  const { data: meetings = [], isLoading } = useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: async () => {
      const res = await api.meetings.$get();
      return res.json();
    },
  });

  if (isLoading) return <p>読み込み中...</p>;

  return (
    <section>
      <h2 className="text-xl font-semibold mb-2">会議一覧</h2>
      <ul className="space-y-1">
        {meetings.map((m) => (
          <li key={m.id} className="border rounded p-2">
            <span className="font-medium">{m.title}</span>
            <span className="ml-2 text-sm text-muted-foreground">
              {new Date(m.heldAt).toLocaleString("ja-JP")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ===== 作成フォーム =====

const createSchema = z.object({
  title: z.string().min(1, "タイトルは必須です"),
  heldAt: z.string().min(1, "開催日時は必須です"),
});

type CreateFormValues = z.infer<typeof createSchema>;

function CreateMeetingForm() {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormValues>({ resolver: zodResolver(createSchema) });

  const mutation = useMutation({
    mutationFn: async (data: CreateFormValues) => {
      const res = await api.meetings.$post({
        json: {
          title: data.title,
          // datetime-local 値を ISO 8601 UTC に変換
          heldAt: new Date(data.heldAt).toISOString(),
        },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      reset();
    },
  });

  return (
    <section>
      <h2 className="text-xl font-semibold mb-2">会議を作成</h2>
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="flex flex-col gap-2 max-w-sm"
      >
        <input
          {...register("title")}
          placeholder="タイトル"
          className="border rounded px-2 py-1"
        />
        {errors.title && (
          <p role="alert" className="text-red-500 text-sm">
            {errors.title.message}
          </p>
        )}
        <input
          {...register("heldAt")}
          id="heldAt"
          aria-label="開催日時"
          type="datetime-local"
          className="border rounded px-2 py-1"
        />
        {errors.heldAt && (
          <p role="alert" className="text-red-500 text-sm">
            {errors.heldAt.message}
          </p>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="bg-primary text-primary-foreground rounded px-4 py-1"
        >
          作成
        </button>
        {mutation.isError && (
          <p className="text-red-500 text-sm">作成に失敗しました</p>
        )}
      </form>
    </section>
  );
}

// ===== WebSocket チャット =====

type WsMessage = { echo?: string; type?: string; [key: string]: unknown };

type WsChatMessage = { id: string; text: string };

function WsChat() {
  const wsRef = useRef<WebSocket | null>(null);
  const [messages, setMessages] = useState<WsChatMessage[]>([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data: WsMessage = JSON.parse(event.data as string);
        const text = data.echo ?? data.type ?? JSON.stringify(data);
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), text }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), text: String(event.data) },
        ]);
      }
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  function sendMessage() {
    if (!input.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ message: input }));
    setInput("");
  }

  return (
    <section>
      <h2 className="text-xl font-semibold mb-2">WebSocket チャット</h2>
      <ul className="border rounded p-2 h-32 overflow-y-auto mb-2 space-y-1">
        {messages.map((msg) => (
          <li key={msg.id} className="text-sm">
            {msg.text}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="メッセージ"
          className="border rounded px-2 py-1 flex-1"
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button
          type="button"
          onClick={sendMessage}
          className="bg-primary text-primary-foreground rounded px-4 py-1"
        >
          送信
        </button>
      </div>
    </section>
  );
}

// ===== メインページ =====

export function Index() {
  return (
    <main className="container mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">Decision Loop</h1>
      <MeetingsList />
      <CreateMeetingForm />
      <WsChat />
    </main>
  );
}
