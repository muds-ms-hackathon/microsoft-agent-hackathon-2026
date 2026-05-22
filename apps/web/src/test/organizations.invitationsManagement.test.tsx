import "./helpers/link-mock";

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
        invitations: {
          $get: vi.fn(),
          ":invitationId": {
            $delete: vi.fn(),
          },
        },
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

import { api } from "@/lib/api";

type Invitation = {
  id: string;
  email: string;
  role: "admin" | "member";
  status: "pending";
  expiresAt: string;
  createdAt: string;
  expired: boolean;
  inviter: { id: string; name: string; displayName: string; email: string };
};

const sampleInvitations: Invitation[] = [
  {
    id: "inv-1",
    email: "bob@example.com",
    role: "member",
    status: "pending",
    expiresAt: "2099-12-31T00:00:00.000Z",
    createdAt: "2026-05-10T00:00:00.000Z",
    expired: false,
    inviter: {
      id: "user-1",
      name: "alice",
      displayName: "Alice A.",
      email: "alice@example.com",
    },
  },
  {
    id: "inv-2",
    email: "dave@example.com",
    role: "admin",
    status: "pending",
    expiresAt: "2026-05-10T00:00:00.000Z",
    createdAt: "2026-05-05T00:00:00.000Z",
    expired: true,
    inviter: {
      id: "user-1",
      name: "alice",
      displayName: "Alice A.",
      email: "alice@example.com",
    },
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("組織詳細ページ - 招待管理セクション", () => {
  beforeEach(() => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(sampleMembers),
    );
  });

  it("owner には招待管理セクションが表示され、pending 招待が一覧される", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "owner" }),
    );
    vi.mocked(api.organizations[":id"].invitations.$get).mockResolvedValue(
      mockJson(sampleInvitations),
    );
    renderDetail();

    const section = await screen.findByRole("region", { name: "招待管理" });
    // 招待リスト (aria-label="招待一覧") がレンダリングされるまで待つ
    const list = await within(section).findByRole("list", {
      name: "招待一覧",
    });
    // member 一覧にも bob@example.com が出る (helper の sampleMembers 由来) ため、
    // 招待一覧の範囲内で検証する。
    expect(within(list).getByText("bob@example.com")).toBeInTheDocument();
    expect(within(list).getByText("dave@example.com")).toBeInTheDocument();
  });

  it("admin にも招待管理セクションが表示される", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "admin" }),
    );
    vi.mocked(api.organizations[":id"].invitations.$get).mockResolvedValue(
      mockJson(sampleInvitations),
    );
    renderDetail();

    expect(
      await screen.findByRole("region", { name: "招待管理" }),
    ).toBeInTheDocument();
  });

  it("member には招待管理セクションが表示されない", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "member" }),
    );
    renderDetail();
    await screen.findByText("ACME 株式会社");
    expect(
      screen.queryByRole("region", { name: "招待管理" }),
    ).not.toBeInTheDocument();
  });

  it("pending 招待が無いときは空状態メッセージが表示される", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "owner" }),
    );
    vi.mocked(api.organizations[":id"].invitations.$get).mockResolvedValue(
      mockJson([]),
    );
    renderDetail();

    const section = await screen.findByRole("region", { name: "招待管理" });
    expect(
      await within(section).findByText("ペンディング中の招待はありません"),
    ).toBeInTheDocument();
  });

  it("期限切れ招待にはバッジが表示される", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "owner" }),
    );
    vi.mocked(api.organizations[":id"].invitations.$get).mockResolvedValue(
      mockJson(sampleInvitations),
    );
    renderDetail();

    const section = await screen.findByRole("region", { name: "招待管理" });
    const list = await within(section).findByRole("list", {
      name: "招待一覧",
    });
    // dave@example.com の行に「期限切れ」ラベルがある
    const daveRow = within(list).getByText("dave@example.com").closest("li");
    if (!daveRow) return;
    expect(
      within(daveRow as HTMLElement).getByText("期限切れ"),
    ).toBeInTheDocument();
    // bob の行は期限切れではない
    const bobRow = within(list).getByText("bob@example.com").closest("li");
    if (!bobRow) return;
    expect(
      within(bobRow as HTMLElement).queryByText("期限切れ"),
    ).not.toBeInTheDocument();
  });

  it("取消ボタンを押すと DELETE が呼ばれ一覧から消える", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "owner" }),
    );
    vi.mocked(api.organizations[":id"].invitations.$get)
      .mockResolvedValueOnce(mockJson(sampleInvitations))
      .mockResolvedValueOnce(mockJson([sampleInvitations[1]]));
    vi.mocked(
      api.organizations[":id"].invitations[":invitationId"].$delete,
    ).mockResolvedValue(mockJson(null, 204));

    renderDetail();

    const section = await screen.findByRole("region", { name: "招待管理" });
    const list = await within(section).findByRole("list", {
      name: "招待一覧",
    });
    const bobRow = within(list).getByText("bob@example.com").closest("li");
    if (!bobRow) return;
    await user.click(
      within(bobRow as HTMLElement).getByRole("button", { name: "取消" }),
    );

    await waitFor(() => {
      expect(
        api.organizations[":id"].invitations[":invitationId"].$delete,
      ).toHaveBeenCalledWith(
        { param: { id: "org-1", invitationId: "inv-1" } },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });

    // 一覧が再取得され、取消した招待が招待一覧から消える
    await waitFor(() => {
      expect(
        within(list).queryByText("bob@example.com"),
      ).not.toBeInTheDocument();
    });
    expect(within(list).getByText("dave@example.com")).toBeInTheDocument();
  });

  it("取消失敗時にはエラー表示が出て一覧は維持される", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "owner" }),
    );
    vi.mocked(api.organizations[":id"].invitations.$get).mockResolvedValue(
      mockJson(sampleInvitations),
    );
    vi.mocked(
      api.organizations[":id"].invitations[":invitationId"].$delete,
    ).mockResolvedValue(mockJson({ error: "bad" }, 500));

    renderDetail();

    const section = await screen.findByRole("region", { name: "招待管理" });
    const list = await within(section).findByRole("list", {
      name: "招待一覧",
    });
    const bobRow = within(list).getByText("bob@example.com").closest("li");
    if (!bobRow) return;
    await user.click(
      within(bobRow as HTMLElement).getByRole("button", { name: "取消" }),
    );

    expect(
      await within(section).findByText("取消に失敗しました"),
    ).toBeInTheDocument();
    expect(within(list).getByText("bob@example.com")).toBeInTheDocument();
  });
});
