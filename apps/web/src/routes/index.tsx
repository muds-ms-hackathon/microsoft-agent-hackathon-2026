import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <main className="container mx-auto p-8">
      <h1 className="text-2xl font-bold">Decision Loop</h1>
      <p className="text-muted-foreground mt-2">定例会議の意思決定サイクルを支援するAIエージェント</p>
    </main>
  );
}
