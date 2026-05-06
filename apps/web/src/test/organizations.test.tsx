import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// ===== 作成モーダル =====

describe("組織作成モーダル", () => {
  beforeEach(() => {
    vi.mocked(api.organizations.$get).mockResolvedValue(mockJson([]));
  });

  it("「組織を作成」ボタンを押すとダイアログが開く", async () => {
    const user = userEvent.setup();
    renderWithQuery(<OrganizationsPage />);

    await user.click(screen.getByRole("button", { name: "組織を作成" }));

    expect(
      await screen.findByRole("dialog", { name: "新しい組織を作成" }),
    ).toBeInTheDocument();
  });

  it("name が空のとき送信できずバリデーションエラーが出る", async () => {
    const user = userEvent.setup();
    renderWithQuery(<OrganizationsPage />);

    await user.click(screen.getByRole("button", { name: "組織を作成" }));
    const dialog = await screen.findByRole("dialog", {
      name: "新しい組織を作成",
    });
    await user.click(within(dialog).getByRole("button", { name: "作成" }));

    expect(await screen.findByText("組織名は必須です")).toBeInTheDocument();
    expect(api.organizations.$post).not.toHaveBeenCalled();
  });

  it("正常送信で $post が呼ばれ、ダイアログが閉じて一覧が再取得される", async () => {
    const user = userEvent.setup();
    const created: Organization = {
      id: "org-3",
      name: "新しい組織",
      description: "説明文",
      role: "owner",
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    };
    vi.mocked(api.organizations.$post).mockResolvedValue(mockJson(created));
    vi.mocked(api.organizations.$get)
      .mockResolvedValueOnce(mockJson([]))
      .mockResolvedValueOnce(mockJson([created]));

    renderWithQuery(<OrganizationsPage />);

    await user.click(screen.getByRole("button", { name: "組織を作成" }));
    const dialog = await screen.findByRole("dialog", {
      name: "新しい組織を作成",
    });
    await user.type(within(dialog).getByLabelText("組織名"), "新しい組織");
    await user.type(within(dialog).getByLabelText("説明"), "説明文");
    await user.click(within(dialog).getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(api.organizations.$post).toHaveBeenCalledWith(
        expect.objectContaining({
          json: { name: "新しい組織", description: "説明文" },
        }),
      );
    });
    // ダイアログが閉じる
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "新しい組織を作成" }),
      ).not.toBeInTheDocument();
    });
    // 一覧が更新され、新しい組織が表示される
    expect(await screen.findByText("新しい組織")).toBeInTheDocument();
  });

  it("description 未入力でも送信可能（API には description を渡さない）", async () => {
    const user = userEvent.setup();
    const created: Organization = {
      id: "org-4",
      name: "説明なし組織",
      description: null,
      role: "owner",
      createdAt: "2026-05-07T00:00:00.000Z",
      updatedAt: "2026-05-07T00:00:00.000Z",
    };
    vi.mocked(api.organizations.$post).mockResolvedValue(mockJson(created));

    renderWithQuery(<OrganizationsPage />);

    await user.click(screen.getByRole("button", { name: "組織を作成" }));
    const dialog = await screen.findByRole("dialog", {
      name: "新しい組織を作成",
    });
    await user.type(within(dialog).getByLabelText("組織名"), "説明なし組織");
    await user.click(within(dialog).getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(api.organizations.$post).toHaveBeenCalledWith(
        expect.objectContaining({ json: { name: "説明なし組織" } }),
      );
    });
  });
});
