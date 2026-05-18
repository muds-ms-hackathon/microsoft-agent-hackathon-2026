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

describe("組織詳細ページ - 編集ボタンの表示", () => {
  beforeEach(() => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(sampleMembers),
    );
  });

  it("owner には「組織情報を編集」ボタンが表示される", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "owner" }),
    );
    renderDetail();
    expect(
      await screen.findByRole("button", { name: "組織情報を編集" }),
    ).toBeInTheDocument();
  });

  it("admin にも「組織情報を編集」ボタンが表示される", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "admin" }),
    );
    renderDetail();
    expect(
      await screen.findByRole("button", { name: "組織情報を編集" }),
    ).toBeInTheDocument();
  });

  it("member には「組織情報を編集」ボタンが表示されない", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "member" }),
    );
    renderDetail();
    await screen.findByText("ACME 株式会社");
    expect(
      screen.queryByRole("button", { name: "組織情報を編集" }),
    ).not.toBeInTheDocument();
  });
});

describe("組織詳細ページ - 組織情報編集ダイアログ", () => {
  beforeEach(() => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "owner" }),
    );
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(sampleMembers),
    );
  });

  it("編集ダイアログを開くと現在の name/description がプレフィルされる", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "組織情報を編集" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "組織情報を編集",
    });
    expect(within(dialog).getByLabelText("組織名")).toHaveValue(
      "ACME 株式会社",
    );
    expect(within(dialog).getByLabelText("説明")).toHaveValue(
      "テスト組織の説明",
    );
  });

  it("name を空にして送信するとバリデーションエラーが出る", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "組織情報を編集" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "組織情報を編集",
    });
    await user.clear(within(dialog).getByLabelText("組織名"));
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    expect(await screen.findByText("組織名は必須です")).toBeInTheDocument();
    expect(api.organizations[":id"].$patch).not.toHaveBeenCalled();
  });

  it("name だけ変更すると description は送信されない（差分送信）", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].$patch).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, name: "新組織名" }),
    );
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "組織情報を編集" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "組織情報を編集",
    });
    const nameInput = within(dialog).getByLabelText("組織名");
    await user.clear(nameInput);
    await user.type(nameInput, "新組織名");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(api.organizations[":id"].$patch).toHaveBeenCalledWith(
        {
          param: { id: "org-1" },
          json: { name: "新組織名" },
        },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "組織情報を編集" }),
      ).not.toBeInTheDocument();
    });
  });

  it("description が null の組織で name のみ編集しても description は送信されない", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, description: null }),
    );
    vi.mocked(api.organizations[":id"].$patch).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, name: "新組織名", description: null }),
    );
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "組織情報を編集" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "組織情報を編集",
    });
    const nameInput = within(dialog).getByLabelText("組織名");
    await user.clear(nameInput);
    await user.type(nameInput, "新組織名");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(api.organizations[":id"].$patch).toHaveBeenCalledWith(
        {
          param: { id: "org-1" },
          json: { name: "新組織名" },
        },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it("description だけ変更すると description のみ送信される", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].$patch).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, description: "新しい説明" }),
    );
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "組織情報を編集" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "組織情報を編集",
    });
    const descInput = within(dialog).getByLabelText("説明");
    await user.clear(descInput);
    await user.type(descInput, "新しい説明");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(api.organizations[":id"].$patch).toHaveBeenCalledWith(
        {
          param: { id: "org-1" },
          json: { description: "新しい説明" },
        },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it("値を変更せずに保存すると $patch は呼ばれずダイアログが閉じる", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "組織情報を編集" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "組織情報を編集",
    });
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "組織情報を編集" }),
      ).not.toBeInTheDocument();
    });
    expect(api.organizations[":id"].$patch).not.toHaveBeenCalled();
  });

  it("送信失敗時はエラー表示が出てダイアログは閉じない", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].$patch).mockResolvedValue(
      mockJson({ error: "bad" }, 400),
    );
    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "組織情報を編集" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "組織情報を編集",
    });
    const nameInput = within(dialog).getByLabelText("組織名");
    await user.clear(nameInput);
    await user.type(nameInput, "失敗予定の新組織名");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    expect(await screen.findByText("更新に失敗しました")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "組織情報を編集" }),
    ).toBeInTheDocument();
  });

  it("保存成功後に org が refetch で更新されると、次回開いたとき新しい値が表示される", async () => {
    const user = userEvent.setup();
    const updatedOrg = { ...ownerOrgDetail, name: "更新後の組織名" };
    vi.mocked(api.organizations[":id"].$get)
      .mockResolvedValueOnce(mockJson(ownerOrgDetail))
      .mockResolvedValue(mockJson(updatedOrg));
    vi.mocked(api.organizations[":id"].$patch).mockResolvedValue(
      mockJson(updatedOrg),
    );

    renderDetail();
    await user.click(
      await screen.findByRole("button", { name: "組織情報を編集" }),
    );
    const dialog1 = await screen.findByRole("dialog", {
      name: "組織情報を編集",
    });
    const nameInput1 = within(dialog1).getByLabelText("組織名");
    await user.clear(nameInput1);
    await user.type(nameInput1, "更新後の組織名");
    await user.click(within(dialog1).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "組織情報を編集" }),
      ).not.toBeInTheDocument();
    });
    await screen.findByText("更新後の組織名");

    await user.click(screen.getByRole("button", { name: "組織情報を編集" }));
    const dialog2 = await screen.findByRole("dialog", {
      name: "組織情報を編集",
    });
    expect(within(dialog2).getByLabelText("組織名")).toHaveValue(
      "更新後の組織名",
    );
  });
});
