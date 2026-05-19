import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvitationsPage } from "../routes/invitations";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    me: {
      invitations: {
        $get: vi.fn(),
      },
    },
    organizations: {
      ":id": {
        join: {
          $post: vi.fn(),
        },
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  const navigateMock = vi.fn();
  return {
    ...actual,
    Link: ({
      to,
      params,
      children,
      className,
    }: {
      to: string;
      params?: Record<string, string>;
      children?: React.ReactNode;
      className?: string;
    }) => {
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
    useNavigate: () => navigateMock,
  };
});

import { api } from "@/lib/api";

import { mockJson } from "./helpers/mockJson";

type Invitation = {
  id: string;
  role: "admin" | "member";
  expiresAt: string;
  createdAt: string;
  organization: { id: string; name: string };
  inviter: { id: string; name: string; displayName: string; email: string };
};

const sampleInvitations: Invitation[] = [
  {
    id: "inv-1",
    role: "member",
    expiresAt: "2099-12-31T00:00:00.000Z",
    createdAt: "2026-05-10T00:00:00.000Z",
    organization: { id: "org-1", name: "ACME 株式会社" },
    inviter: {
      id: "user-2",
      name: "bob",
      displayName: "Bob",
      email: "bob@example.com",
    },
  },
  {
    id: "inv-2",
    role: "admin",
    expiresAt: "2099-12-31T00:00:00.000Z",
    createdAt: "2026-05-09T00:00:00.000Z",
    organization: { id: "org-2", name: "別の組織" },
    inviter: {
      id: "user-3",
      name: "carol",
      displayName: "Carol",
      email: "carol@example.com",
    },
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("招待一覧ページ", () => {
  it("認証ユーザーに届いた招待一覧を組織名・ロール・招待者と共に表示する", async () => {
    vi.mocked(api.me.invitations.$get).mockResolvedValue(
      mockJson(sampleInvitations),
    );

    renderWithQuery(<InvitationsPage />);

    expect(await screen.findByText("ACME 株式会社")).toBeInTheDocument();
    expect(screen.getByText("別の組織")).toBeInTheDocument();
    // ロール表示
    expect(screen.getByText("メンバー")).toBeInTheDocument();
    expect(screen.getByText("管理者")).toBeInTheDocument();
    // 招待者名 (displayName)
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
    expect(screen.getByText(/Carol/)).toBeInTheDocument();
  });

  it("招待が無いときは空状態メッセージが表示される", async () => {
    vi.mocked(api.me.invitations.$get).mockResolvedValue(mockJson([]));

    renderWithQuery(<InvitationsPage />);

    expect(
      await screen.findByText("受信中の招待はありません"),
    ).toBeInTheDocument();
  });

  it("読み込み中はローディング表示が出る", () => {
    vi.mocked(api.me.invitations.$get).mockImplementation(
      () => new Promise(() => {}),
    );
    renderWithQuery(<InvitationsPage />);
    expect(screen.getByText("読み込み中...")).toBeInTheDocument();
  });

  it("取得失敗時はエラー表示が出る", async () => {
    vi.mocked(api.me.invitations.$get).mockRejectedValue(new Error("network"));
    renderWithQuery(<InvitationsPage />);
    expect(await screen.findByText("取得に失敗しました")).toBeInTheDocument();
  });

  it("受諾ボタンを押すと /organizations/:id/join が呼ばれ一覧から消える", async () => {
    const user = userEvent.setup();
    vi.mocked(api.me.invitations.$get)
      .mockResolvedValueOnce(mockJson(sampleInvitations))
      .mockResolvedValueOnce(mockJson([sampleInvitations[1]]));
    vi.mocked(api.organizations[":id"].join.$post).mockResolvedValue(
      mockJson({
        userId: "user-1",
        organizationId: "org-1",
        role: "member",
        joinedAt: "2026-05-19T00:00:00.000Z",
      }),
    );

    renderWithQuery(<InvitationsPage />);

    const acmeRow = (await screen.findByText("ACME 株式会社")).closest("li");
    expect(acmeRow).not.toBeNull();
    if (!acmeRow) return;
    const acceptButton = within(acmeRow as HTMLElement).getByRole("button", {
      name: "受諾",
    });
    await user.click(acceptButton);

    await waitFor(() => {
      expect(api.organizations[":id"].join.$post).toHaveBeenCalledWith(
        { param: { id: "org-1" } },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });

    // 受諾後は一覧が再取得され、受諾した招待が消える
    await waitFor(() => {
      expect(screen.queryByText("ACME 株式会社")).not.toBeInTheDocument();
    });
    expect(screen.getByText("別の組織")).toBeInTheDocument();
  });

  it("受諾失敗時にはエラー表示が出て一覧は維持される", async () => {
    const user = userEvent.setup();
    vi.mocked(api.me.invitations.$get).mockResolvedValue(
      mockJson(sampleInvitations),
    );
    vi.mocked(api.organizations[":id"].join.$post).mockResolvedValue(
      mockJson({ error: "招待が見つかりません" }, 404),
    );

    renderWithQuery(<InvitationsPage />);

    const acmeRow = (await screen.findByText("ACME 株式会社")).closest("li");
    if (!acmeRow) return;
    await user.click(
      within(acmeRow as HTMLElement).getByRole("button", { name: "受諾" }),
    );

    expect(await screen.findByText("受諾に失敗しました")).toBeInTheDocument();
    // 一覧は消えない
    expect(screen.getByText("ACME 株式会社")).toBeInTheDocument();
  });
});
