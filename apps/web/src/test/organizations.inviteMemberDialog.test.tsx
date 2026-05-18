import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mockJson,
  ownerOrgDetail,
  renderDetail,
  sampleMembers,
} from "./helpers/organizationDetail";

vi.mock("@/lib/api", () => ({
  api: {
    organizations: {
      ":id": {
        $get: vi.fn(),
        $patch: vi.fn(),
        $delete: vi.fn(),
        invite: { $post: vi.fn() },
        members: {
          $get: vi.fn(),
          ":userId": { $delete: vi.fn() },
        },
        meetings: { $post: vi.fn() },
      },
    },
    "recurring-meetings": {
      ":id": {
        $patch: vi.fn(),
        $delete: vi.fn(),
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  type MockLinkProps = {
    to: string;
    params?: Record<string, string>;
    children?: React.ReactNode;
    className?: string;
  };
  return {
    ...actual,
    Link: ({ to, params, children, className }: MockLinkProps) => {
      const href =
        typeof to === "string"
          ? to.replace(/\$(\w+)/g, (_, k: string) => params?.[k] ?? "")
          : String(to);
      return (
        <a href={href} className={className}>
          {children}
        </a>
      );
    },
  };
});

import { api } from "@/lib/api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("組織詳細ページ - 招待ボタンの表示", () => {
  beforeEach(() => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(sampleMembers),
    );
  });

  it("owner には「メンバーを招待」ボタンが表示される", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "owner" }),
    );
    renderDetail();
    expect(
      await screen.findByRole("button", { name: "メンバーを招待" }),
    ).toBeInTheDocument();
  });

  it("admin にも「メンバーを招待」ボタンが表示される", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "admin" }),
    );
    renderDetail();
    expect(
      await screen.findByRole("button", { name: "メンバーを招待" }),
    ).toBeInTheDocument();
  });

  it("member には「メンバーを招待」ボタンが表示されない", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "member" }),
    );
    renderDetail();
    await screen.findByText("ACME 株式会社");
    expect(
      screen.queryByRole("button", { name: "メンバーを招待" }),
    ).not.toBeInTheDocument();
  });
});

describe("組織詳細ページ - メンバー招待ダイアログ", () => {
  beforeEach(() => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "owner" }),
    );
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(sampleMembers),
    );
  });

  it("「メンバーを招待」ボタンを押すとダイアログが開く", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "メンバーを招待" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "メンバーを招待" }),
    ).toBeInTheDocument();
  });

  it("email 未入力のまま送信するとバリデーションエラーが出る", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "メンバーを招待" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "メンバーを招待",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "招待を送信" }),
    );
    expect(
      await screen.findByText("メールアドレスの形式が正しくありません"),
    ).toBeInTheDocument();
    expect(api.organizations[":id"].invite.$post).not.toHaveBeenCalled();
  });

  it("正常送信で $post が呼ばれ、role はデフォルト member、ダイアログが閉じる", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].invite.$post).mockResolvedValue(
      mockJson({ id: "inv-1" }, 201),
    );
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "メンバーを招待" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "メンバーを招待",
    });
    await user.type(
      within(dialog).getByLabelText("メールアドレス"),
      "newuser@example.com",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "招待を送信" }),
    );
    await waitFor(() => {
      expect(api.organizations[":id"].invite.$post).toHaveBeenCalledWith(
        {
          param: { id: "org-1" },
          json: { email: "newuser@example.com", role: "member" },
        },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "メンバーを招待" }),
      ).not.toBeInTheDocument();
    });
  });

  it("role セレクトで admin を選ぶと送信ペイロードに反映される", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].invite.$post).mockResolvedValue(
      mockJson({ id: "inv-2" }, 201),
    );
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "メンバーを招待" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "メンバーを招待",
    });
    await user.type(
      within(dialog).getByLabelText("メールアドレス"),
      "adminuser@example.com",
    );
    await user.selectOptions(within(dialog).getByLabelText("ロール"), "admin");
    await user.click(
      within(dialog).getByRole("button", { name: "招待を送信" }),
    );
    await waitFor(() => {
      expect(api.organizations[":id"].invite.$post).toHaveBeenCalledWith(
        {
          param: { id: "org-1" },
          json: { email: "adminuser@example.com", role: "admin" },
        },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it("送信失敗時はエラー表示が出てダイアログは閉じない", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].invite.$post).mockResolvedValue(
      mockJson({ error: "duplicate" }, 409),
    );
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "メンバーを招待" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "メンバーを招待",
    });
    await user.type(
      within(dialog).getByLabelText("メールアドレス"),
      "dup@example.com",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "招待を送信" }),
    );
    expect(
      await screen.findByText("招待の送信に失敗しました"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "メンバーを招待" }),
    ).toBeInTheDocument();
  });
});
