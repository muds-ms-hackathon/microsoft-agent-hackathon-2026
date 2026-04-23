import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Index } from "../routes/index";

// hono/client api モジュールをモック
vi.mock("@/lib/api", () => ({
	api: {
		meetings: {
			$get: vi.fn(),
			$post: vi.fn(),
		},
	},
}));

import { api } from "@/lib/api";

type Meeting = {
	id: string;
	title: string;
	heldAt: string;
	createdAt: string;
};

const mockMeetings: Meeting[] = [
	{
		id: "1",
		title: "週次定例",
		heldAt: "2026-04-21T10:00:00.000Z",
		createdAt: "2026-04-20T00:00:00.000Z",
	},
	{
		id: "2",
		title: "月次レビュー",
		heldAt: "2026-04-14T14:00:00.000Z",
		createdAt: "2026-04-13T00:00:00.000Z",
	},
];

function renderWithQuery(ui: React.ReactElement) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return {
		client,
		...render(
			<QueryClientProvider client={client}>{ui}</QueryClientProvider>,
		),
	};
}

beforeEach(() => {
	vi.stubGlobal(
		"WebSocket",
		vi.fn(() => ({
			send: vi.fn(),
			close: vi.fn(),
			readyState: 1,
			onmessage: null,
			onopen: null,
			onclose: null,
			onerror: null,
		})),
	);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

// ===== meetings 一覧表示 =====

describe("meetings 一覧表示", () => {
	it("meetings の一覧が表示される", async () => {
		vi.mocked(api.meetings.$get).mockResolvedValue({
			json: async () => mockMeetings,
		} as never);

		renderWithQuery(<Index />);

		expect(await screen.findByText("週次定例")).toBeInTheDocument();
		expect(await screen.findByText("月次レビュー")).toBeInTheDocument();
	});

	it("meetings が空のとき空リストを表示する", async () => {
		vi.mocked(api.meetings.$get).mockResolvedValue({
			json: async () => [],
		} as never);

		renderWithQuery(<Index />);

		await waitFor(() => {
			expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
		});
	});
});
