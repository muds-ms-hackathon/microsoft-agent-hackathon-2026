import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

function TestComponent() {
  const { data } = useQuery({
    queryKey: ["test"],
    queryFn: () => Promise.resolve("クエリ結果"),
    staleTime: Infinity,
  });
  return <div>{data ?? "読み込み中"}</div>;
}

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("TanStack Query v5", () => {
  it("QueryClientProvider でラップされたコンポーネントがデータを表示する", async () => {
    renderWithQuery(<TestComponent />);
    expect(await screen.findByText("クエリ結果")).toBeInTheDocument();
  });
});
