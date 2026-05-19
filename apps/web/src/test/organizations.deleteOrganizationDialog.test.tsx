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

describe("組織詳細ページ - 組織削除ボタンの表示", () => {
  beforeEach(() => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(sampleMembers),
    );
  });

  it("owner には「組織を削除」ボタンが表示される", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "owner" }),
    );
    renderDetail();
    expect(
      await screen.findByRole("button", { name: "組織を削除" }),
    ).toBeInTheDocument();
  });

  it("admin には「組織を削除」ボタンが表示されない", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "admin" }),
    );
    renderDetail();
    await screen.findByText("ACME 株式会社");
    expect(
      screen.queryByRole("button", { name: "組織を削除" }),
    ).not.toBeInTheDocument();
  });

  it("member には「組織を削除」ボタンが表示されない", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "member" }),
    );
    renderDetail();
    await screen.findByText("ACME 株式会社");
    expect(
      screen.queryByRole("button", { name: "組織を削除" }),
    ).not.toBeInTheDocument();
  });
});

describe("組織詳細ページ - 組織削除ダイアログ", () => {
  beforeEach(() => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "owner" }),
    );
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(sampleMembers),
    );
  });

  it("削除ボタンを押すと確認ダイアログが開く", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "組織を削除" }));
    expect(
      await screen.findByRole("dialog", { name: "組織を削除" }),
    ).toBeInTheDocument();
  });

  it("組織名と一致しない入力では削除ボタンが disabled", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "組織を削除" }));
    const dialog = await screen.findByRole("dialog", { name: "組織を削除" });
    await user.type(
      within(dialog).getByLabelText("確認のため組織名を入力してください"),
      "違う名前",
    );
    expect(
      within(dialog).getByRole("button", { name: "削除を実行" }),
    ).toBeDisabled();
  });

  it("組織名と一致する入力で削除ボタンが enabled になり、押下で $delete が呼ばれ onOrganizationDeleted が実行される", async () => {
    const user = userEvent.setup();
    const onOrganizationDeleted = vi.fn();
    vi.mocked(api.organizations[":id"].$delete).mockResolvedValue(
      mockJson(null, 204),
    );
    renderDetail({ onOrganizationDeleted });
    await user.click(await screen.findByRole("button", { name: "組織を削除" }));
    const dialog = await screen.findByRole("dialog", { name: "組織を削除" });
    const confirmInput = within(dialog).getByLabelText(
      "確認のため組織名を入力してください",
    );
    await user.type(confirmInput, "ACME 株式会社");
    const confirmButton = within(dialog).getByRole("button", {
      name: "削除を実行",
    });
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);
    await waitFor(() => {
      expect(api.organizations[":id"].$delete).toHaveBeenCalledWith(
        { param: { id: "org-1" } },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
    await waitFor(() => {
      expect(onOrganizationDeleted).toHaveBeenCalledTimes(1);
    });
  });

  it("削除失敗時はエラー表示が出てダイアログは閉じない", async () => {
    const user = userEvent.setup();
    const onOrganizationDeleted = vi.fn();
    vi.mocked(api.organizations[":id"].$delete).mockResolvedValue(
      mockJson({ error: "forbidden" }, 403),
    );
    renderDetail({ onOrganizationDeleted });
    await user.click(await screen.findByRole("button", { name: "組織を削除" }));
    const dialog = await screen.findByRole("dialog", { name: "組織を削除" });
    await user.type(
      within(dialog).getByLabelText("確認のため組織名を入力してください"),
      "ACME 株式会社",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "削除を実行" }),
    );
    expect(await screen.findByText("削除に失敗しました")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "組織を削除" }),
    ).toBeInTheDocument();
    expect(onOrganizationDeleted).not.toHaveBeenCalled();
  });
});
