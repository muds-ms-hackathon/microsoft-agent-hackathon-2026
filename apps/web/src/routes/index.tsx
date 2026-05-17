import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: Index,
});

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

    const pushMessage = (text: string) =>
      setMessages((prev) =>
        [...prev, { id: crypto.randomUUID(), text }].slice(-100),
      );

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data: WsMessage = JSON.parse(event.data as string);
        pushMessage(data.echo ?? data.type ?? JSON.stringify(data));
      } catch {
        pushMessage(String(event.data));
      }
    };

    ws.onerror = () => {
      pushMessage("接続エラーが発生しました");
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  const sendMessage = useCallback(() => {
    if (!input.trim() || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ message: input }));
    setInput("");
  }, [input]);

  return (
    <section>
      <h2 className="text-xl font-semibold mb-2">WebSocket チャット</h2>
      <ul
        aria-label="チャットメッセージ"
        className="border rounded p-2 h-32 overflow-y-auto mb-2 space-y-1"
      >
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
// 旧 MeetingsList / CreateMeetingForm は無認証 API (GET/POST /meetings) に依存していたため撤去した。
// ダッシュボードの実装は別 Issue (#172, PR #197) で再構築する。

export function Index() {
  return (
    <section
      aria-labelledby="dashboard-title"
      className="container mx-auto p-8 space-y-8"
    >
      <h1 id="dashboard-title" className="text-2xl font-bold">
        Decision Loop
      </h1>
      <WsChat />
    </section>
  );
}
