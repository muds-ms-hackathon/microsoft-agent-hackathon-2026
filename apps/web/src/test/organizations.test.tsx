import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrganizationsPage } from "../routes/organizations";
import { renderWithQuery } from "./test-utils";

// hono/client api モジュールをモック
vi.mock("@/lib/api", () => ({
  api: {
    organizations: {
      $get: vi.fn(),
      $post: vi.fn(),
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

import { api } from "@/lib/api";

// hono/client のレスポンス型が複雑なため、モックの戻り値はヘルパー経由でキャスト
function mockJson<T>(data: T) {
  return { json: async () => data } as never;
}

type Organization = {
  id: string;
  name: string;
  description: string | null;
  role: "owner" | "admin" | "member";
  createdAt: string;
  updatedAt: string;
};

const mockOrgs: Organization[] = [
  {
    id: "org-1",
    name: "ACME 株式会社",
    description: "テスト組織",
    role: "owner",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "org-2",
    name: "別の組織",
    description: null,
    role: "member",
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

// ===== 一覧表示 =====

describe("組織一覧表示", () => {
  it("自分が所属する組織のカードが name/description/role と共に表示される", async () => {
    vi.mocked(api.organizations.$get).mockResolvedValue(mockJson(mockOrgs));

    renderWithQuery(<OrganizationsPage />);

    expect(await screen.findByText("ACME 株式会社")).toBeInTheDocument();
    expect(screen.getByText("テスト組織")).toBeInTheDocument();
    expect(screen.getByText("別の組織")).toBeInTheDocument();
    // 日本語ロールラベル
    expect(screen.getByText("オーナー")).toBeInTheDocument();
    expect(screen.getByText("メンバー")).toBeInTheDocument();
  });

  it("組織が無いとき空状態メッセージが表示される", async () => {
    vi.mocked(api.organizations.$get).mockResolvedValue(mockJson([]));

    renderWithQuery(<OrganizationsPage />);

    expect(
      await screen.findByText("所属している組織がありません"),
    ).toBeInTheDocument();
  });

  it("読み込み中はローディング表示が出る", async () => {
    vi.mocked(api.organizations.$get).mockImplementation(
      () => new Promise(() => {}),
    );
    renderWithQuery(<OrganizationsPage />);
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
  });

  it("取得失敗時はエラー表示が出る", async () => {
    vi.mocked(api.organizations.$get).mockRejectedValue(new Error("network"));
    renderWithQuery(<OrganizationsPage />);
    expect(await screen.findByText("取得に失敗しました")).toBeInTheDocument();
  });
});
