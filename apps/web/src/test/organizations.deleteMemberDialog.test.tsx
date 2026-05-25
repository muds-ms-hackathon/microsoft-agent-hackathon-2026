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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("組織詳細ページ - メンバー削除ボタンの表示", () => {
  beforeEach(() => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(sampleMembers),
    );
  });

  it("owner には自分以外の各メンバー行に「削除」ボタンが表示される", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "owner" }),
    );
    renderDetail({ currentUserEmail: "alice@example.com" });
    const memberList = await screen.findByRole("list", {
      name: "メンバー一覧",
    });
    expect(
      within(memberList).getByRole("button", { name: "Bob B. を削除" }),
    ).toBeInTheDocument();
    expect(
      within(memberList).getByRole("button", { name: "Carol C. を削除" }),
    ).toBeInTheDocument();
    expect(
      within(memberList).queryByRole("button", { name: "Alice A. を削除" }),
    ).not.toBeInTheDocument();
  });

  it("admin にはメンバー行に削除ボタンが表示されない", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "admin" }),
    );
    renderDetail({ currentUserEmail: "bob@example.com" });
    await screen.findByText("ACME 株式会社");
    expect(
      screen.queryByRole("button", { name: "Carol C. を削除" }),
    ).not.toBeInTheDocument();
  });

  it("member にはメンバー行に削除ボタンが表示されない", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "member" }),
    );
    renderDetail({ currentUserEmail: "carol@example.com" });
    await screen.findByText("ACME 株式会社");
    expect(
      screen.queryByRole("button", { name: "Bob B. を削除" }),
    ).not.toBeInTheDocument();
  });
});

describe("組織詳細ページ - メンバー削除確認ダイアログ", () => {
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
    renderDetail({ currentUserEmail: "alice@example.com" });
    await user.click(
      await screen.findByRole("button", { name: "Bob B. を削除" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "メンバーを削除" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Bob B\..*を組織から削除しますか/),
    ).toBeInTheDocument();
  });

  it("確認後 DELETE が呼ばれ、ダイアログが閉じる", async () => {
    const user = userEvent.setup();
    vi.mocked(
      api.organizations[":id"].members[":userId"].$delete,
    ).mockResolvedValue(mockJson(null, 204));
    renderDetail({ currentUserEmail: "alice@example.com" });
    await user.click(
      await screen.findByRole("button", { name: "Bob B. を削除" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "メンバーを削除",
    });
    await user.click(within(dialog).getByRole("button", { name: "削除する" }));
    await waitFor(() => {
      expect(
        api.organizations[":id"].members[":userId"].$delete,
      ).toHaveBeenCalledWith(
        { param: { id: "org-1", userId: "user-2" } },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "メンバーを削除" }),
      ).not.toBeInTheDocument();
    });
  });

  it("削除失敗時はエラー表示が出てダイアログは閉じない", async () => {
    const user = userEvent.setup();
    vi.mocked(
      api.organizations[":id"].members[":userId"].$delete,
    ).mockResolvedValue(mockJson({ error: "forbidden" }, 403));
    renderDetail({ currentUserEmail: "alice@example.com" });
    await user.click(
      await screen.findByRole("button", { name: "Bob B. を削除" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "メンバーを削除",
    });
    await user.click(within(dialog).getByRole("button", { name: "削除する" }));
    expect(await screen.findByText("削除に失敗しました")).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "メンバーを削除" }),
    ).toBeInTheDocument();
  });
});
