import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

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

// ===== メインページ =====

export function Index() {
  return (
    <main className="container mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">Decision Loop</h1>
      <MeetingsList />
    </main>
  );
}
