import { Sidebar } from "@/components/layout/Sidebar";
import { api } from "@/lib/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import {
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// hono RPC client は型が複雑なので、Sidebar が触る GET / POST だけモックする。
vi.mock("@/lib/api", () => ({
  api: {
    organizations: {
      $get: vi.fn(),
      $post: vi.fn(),
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

// TanStack Router の Link は RouterProvider 配下でないと落ちるため、
// テスト中は href を持つ <a> として描画するモックに差し替える。
// asChild で囲んだ場合に Radix が DropdownMenuItem 上にイベントを伝搬しても
// 単純な <a> として href が assert できる形にする。
vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  type MockLinkProps = {
    to: string;
    params?: Record<string, string>;
    children?: React.ReactNode;
    className?: string;
    activeProps?: unknown;
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

function mockJson<T>(data: T) {
  return { ok: true, status: 200, json: async () => data } as never;
}

function renderSidebar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const store = createStore();
  return {
    client,
    store,
    ...render(
      <QueryClientProvider client={client}>
        <Provider store={store}>
          <Sidebar />
        </Provider>
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  // localStorage はテスト全体で共有されるため、状態を引き継がないように毎回クリア。
  // currentOrganizationId は localStorage から復元されるため、ここをクリアしないと
  // 他テストで set した値が次のテストの初期状態に漏れる。
  localStorage.clear();
  // userEvent は内部で setTimeout を使う場面があるが本テストでは fakeTimers を
  // 使わないため、明示的にリセットしておくだけで十分。
  (api.organizations.$get as Mock).mockReset();
  (api.organizations.$post as Mock).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Sidebar 組織セレクター", () => {
  it("一覧取得中はスケルトンが表示される", () => {
    (api.organizations.$get as Mock).mockImplementation(
      () => new Promise(() => {}),
    );

    renderSidebar();

    expect(screen.getByLabelText("組織一覧を読み込み中")).toBeInTheDocument();
  });

  it("組織が 0 件のとき「新しい組織を作成」CTA が表示される", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson([]));

    renderSidebar();

    expect(
      await screen.findByRole("button", { name: /新しい組織を作成/ }),
    ).toBeInTheDocument();
    // 切り替えメニューはまだ出ない。
    expect(
      screen.queryByRole("button", { name: "組織を切り替え" }),
    ).not.toBeInTheDocument();
  });

  it("0 件のとき CTA を押すと作成ダイアログが開く", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson([]));
    const user = userEvent.setup();

    renderSidebar();

    await user.click(
      await screen.findByRole("button", { name: /新しい組織を作成/ }),
    );

    expect(
      await screen.findByRole("dialog", { name: "新しい組織を作成" }),
    ).toBeInTheDocument();
  });

  it("1 件以上あり currentId 未設定なら先頭組織が自動選択され、トリガーボタンに表示される", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));

    renderSidebar();

    // 自動選択後、トリガーボタンに先頭組織名が出る (effect が走るのを待つ)
    const trigger = await screen.findByRole("button", {
      name: "組織を切り替え",
    });
    expect(within(trigger).getByText("ACME 株式会社")).toBeInTheDocument();
    // localStorage にも書き込まれる
    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBe("org-1");
    });
  });

  it("currentId が一覧に存在しない場合は先頭組織にフォールバックする", async () => {
    // 「以前選択していた組織」が削除/退会された等で消えたケース。
    localStorage.setItem("current_organization_id", "org-deleted");
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));

    renderSidebar();

    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBe("org-1");
    });
  });

  it("組織が 0 件になると currentId はクリアされる", async () => {
    localStorage.setItem("current_organization_id", "org-1");
    (api.organizations.$get as Mock).mockResolvedValue(mockJson([]));

    renderSidebar();

    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBeNull();
    });
  });

  it("ドロップダウンから別組織を選択すると localStorage が更新される", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));
    const user = userEvent.setup();

    renderSidebar();

    // 自動選択を待つ
    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBe("org-1");
    });

    await user.click(
      await screen.findByRole("button", { name: "組織を切り替え" }),
    );
    // RadioItem として別組織を選択
    const item = await screen.findByRole("menuitemradio", { name: "別の組織" });
    await user.click(item);

    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBe("org-2");
    });
  });

  it("ドロップダウンに「現在の組織の詳細」リンクが /organizations/{currentId} で出る", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));
    const user = userEvent.setup();

    renderSidebar();

    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBe("org-1");
    });

    await user.click(
      await screen.findByRole("button", { name: "組織を切り替え" }),
    );

    const link = await screen.findByRole("link", {
      name: /現在の組織の詳細/,
    });
    expect(link).toHaveAttribute("href", "/organizations/org-1");
  });

  it("ドロップダウンに「すべての組織を見る」リンクが /organizations で出る", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));
    const user = userEvent.setup();

    renderSidebar();

    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBe("org-1");
    });

    await user.click(
      await screen.findByRole("button", { name: "組織を切り替え" }),
    );

    const link = await screen.findByRole("link", {
      name: /すべての組織を見る/,
    });
    expect(link).toHaveAttribute("href", "/organizations");
  });

  it("ドロップダウン内の「新しい組織を作成」で作成ダイアログが開く", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));
    const user = userEvent.setup();

    renderSidebar();

    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBe("org-1");
    });

    await user.click(
      await screen.findByRole("button", { name: "組織を切り替え" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /新しい組織を作成/ }),
    );

    expect(
      await screen.findByRole("dialog", { name: "新しい組織を作成" }),
    ).toBeInTheDocument();
  });

  it("作成ダイアログから組織を作成すると、新しい組織が currentId に設定される", async () => {
    const created: Organization = {
      id: "org-new",
      name: "新規",
      description: null,
      role: "owner",
      createdAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-14T00:00:00.000Z",
    };
    // 0 件 → 作成 → 1 件 (refetch 結果) の順で返す
    (api.organizations.$get as Mock)
      .mockResolvedValueOnce(mockJson([]))
      .mockResolvedValue(mockJson([created]));
    (api.organizations.$post as Mock).mockResolvedValue(mockJson(created));
    const user = userEvent.setup();

    renderSidebar();

    await user.click(
      await screen.findByRole("button", { name: /新しい組織を作成/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "新しい組織を作成",
    });
    await user.type(within(dialog).getByLabelText("組織名"), "新規");
    await user.click(within(dialog).getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBe("org-new");
    });
  });
});
