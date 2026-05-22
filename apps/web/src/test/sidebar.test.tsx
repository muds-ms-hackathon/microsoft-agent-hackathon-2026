import { Sidebar } from "@/components/layout/Sidebar";
import type { Organization } from "@/features/organizations/types";
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
      ":id": {
        meetings: { $get: vi.fn(), $post: vi.fn() },
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

// 現在パスを切り替えるためのテスト用ホルダー。useRouterState のモックから参照する。
// テストごとに beforeEach で "/" にリセットされる。
// hoisted で生成することで、vi.mock factory が hoist された後でも参照が解決する。
const { navigateMock, currentPathnameRef } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  currentPathnameRef: { value: "/" },
}));

// Link / useRouterState / useNavigate をまとめて差し替える。
// useRouterState は実装側 (useRouterState({ select: (s) => s.location.pathname }))
// と同じ呼び出し形を維持するため、helper が selector を実行する。
vi.mock("@tanstack/react-router", async () => {
  const { buildRouterMock } = await import("./helpers/router-mock");
  return buildRouterMock({
    useNavigate: navigateMock,
    routerState: () => ({
      location: { pathname: currentPathnameRef.value },
    }),
  });
});

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

import { mockJson } from "./helpers/mockJson";

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
  (api.organizations[":id"].meetings.$get as Mock).mockReset();
  (api.organizations[":id"].meetings.$post as Mock).mockReset();
  // 定例 GET は組織選択直後に走るため、デフォルトでは空配列を返しておく。
  (api.organizations[":id"].meetings.$get as Mock).mockResolvedValue(
    mockJson([]),
  );
  // ルーターモックの状態もデフォルト (ダッシュボード) に戻す。
  currentPathnameRef.value = "/";
  navigateMock.mockReset();
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

  it("組織詳細ページにいるときに切替すると、新しい組織の詳細ページに navigate される", async () => {
    // /organizations/$id 上では「その場に留まる」と古い組織の内容が
    // 表示されたままになるため、新しい組織の詳細ページに自動遷移する。
    currentPathnameRef.value = "/organizations/org-1";
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
      await screen.findByRole("menuitemradio", { name: "別の組織" }),
    );

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: "/organizations/$id",
        params: { id: "org-2" },
      });
    });
  });

  it("詳細ページ以外で切替したときは navigate されない（その場に留まる）", async () => {
    // 一覧やダッシュボードにいる時は遷移を強制しない。例えば /organizations は
    // 組織非依存のページで、切替時に飛ばすと UX が破壊的になる。
    currentPathnameRef.value = "/organizations";
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
      await screen.findByRole("menuitemradio", { name: "別の組織" }),
    );

    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBe("org-2");
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("ダッシュボード上で切替しても navigate されない", async () => {
    currentPathnameRef.value = "/";
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
      await screen.findByRole("menuitemradio", { name: "別の組織" }),
    );

    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBe("org-2");
    });
    expect(navigateMock).not.toHaveBeenCalled();
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

describe("Sidebar 定例リスト", () => {
  it("選択中の組織配下の定例が表示される", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));
    (api.organizations[":id"].meetings.$get as Mock).mockResolvedValue(
      mockJson([
        {
          id: "meet-1",
          organizationId: "org-1",
          name: "週次定例",
          description: null,
          scheduleCron: "0 10 * * 1",
          defaultDurationMinutes: 60,
          createdAt: "2026-05-03T00:00:00.000Z",
          updatedAt: "2026-05-03T00:00:00.000Z",
          _count: { members: 2 },
        },
        {
          id: "meet-2",
          organizationId: "org-1",
          name: "月次レビュー",
          description: null,
          scheduleCron: "0 9 1 * *",
          defaultDurationMinutes: 90,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
          _count: { members: 3 },
        },
      ]),
    );

    renderSidebar();

    expect(await screen.findByText("週次定例")).toBeInTheDocument();
    expect(screen.getByText("月次レビュー")).toBeInTheDocument();
    // クリックで各定例の詳細画面（会議一覧）へ遷移する
    expect(screen.getByRole("link", { name: /週次定例/ })).toHaveAttribute(
      "href",
      "/recurring-meetings/meet-1",
    );
    expect(screen.getByRole("link", { name: /月次レビュー/ })).toHaveAttribute(
      "href",
      "/recurring-meetings/meet-2",
    );
  });

  it("選択中組織の定例が 0 件のとき「定例はまだありません」を表示する", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));
    (api.organizations[":id"].meetings.$get as Mock).mockResolvedValue(
      mockJson([]),
    );

    renderSidebar();

    expect(await screen.findByText("定例はまだありません")).toBeInTheDocument();
  });

  it("組織が 0 件のときは定例 API を叩かない", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson([]));

    renderSidebar();

    // 組織 CTA が出るまで待ち、定例 API が叩かれないことを確認
    await screen.findByRole("button", { name: /新しい組織を作成/ });
    expect(api.organizations[":id"].meetings.$get).not.toHaveBeenCalled();
  });

  it("組織を切り替えると別組織の定例 API が叩かれる", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));
    const user = userEvent.setup();

    renderSidebar();

    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBe("org-1");
    });

    // 別組織に切り替え
    await user.click(
      await screen.findByRole("button", { name: "組織を切り替え" }),
    );
    await user.click(
      await screen.findByRole("menuitemradio", { name: /別の組織/ }),
    );

    await waitFor(() => {
      expect(api.organizations[":id"].meetings.$get).toHaveBeenCalledWith(
        { param: { id: "org-2" } },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it("組織選択時は定例セクションに「定例を追加」ボタンが表示される", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));
    renderSidebar();
    expect(
      await screen.findByRole("button", { name: "定例を追加" }),
    ).toBeInTheDocument();
  });

  it("組織が 0 件のときは「定例を追加」ボタンを表示しない", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson([]));
    renderSidebar();
    await screen.findByRole("button", { name: /新しい組織を作成/ });
    expect(
      screen.queryByRole("button", { name: "定例を追加" }),
    ).not.toBeInTheDocument();
  });

  it("「定例を追加」ボタンを押すと作成ダイアログが開く", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));
    const user = userEvent.setup();

    renderSidebar();

    await user.click(await screen.findByRole("button", { name: "定例を追加" }));
    expect(
      await screen.findByRole("dialog", { name: "定例を作成" }),
    ).toBeInTheDocument();
  });

  it("定例取得中は読み込みスケルトンが表示される", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));
    // 解決しない Promise でローディング状態に固定
    (api.organizations[":id"].meetings.$get as Mock).mockImplementation(
      () => new Promise(() => {}),
    );

    renderSidebar();

    expect(
      await screen.findByLabelText("定例一覧を読み込み中"),
    ).toBeInTheDocument();
  });

  it("定例取得に失敗すると専用のエラー表示が出る", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));
    (api.organizations[":id"].meetings.$get as Mock).mockRejectedValue(
      new Error("network"),
    );

    renderSidebar();

    expect(
      await screen.findByText("定例の取得に失敗しました"),
    ).toBeInTheDocument();
  });

  it("サイドバーから作成すると現在組織配下に POST される", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));
    (api.organizations[":id"].meetings.$post as Mock).mockResolvedValue(
      mockJson({
        id: "meet-new",
        organizationId: "org-1",
        name: "新規定例",
        description: null,
        scheduleCron: "0 10 * * 1",
        defaultDurationMinutes: 60,
        createdAt: "2026-05-16T00:00:00.000Z",
        updatedAt: "2026-05-16T00:00:00.000Z",
      }),
    );
    const user = userEvent.setup();

    renderSidebar();

    await waitFor(() => {
      expect(localStorage.getItem("current_organization_id")).toBe("org-1");
    });

    await user.click(await screen.findByRole("button", { name: "定例を追加" }));
    const dialog = await screen.findByRole("dialog", { name: "定例を作成" });
    await user.type(within(dialog).getByLabelText("定例名"), "新規定例");
    await user.click(within(dialog).getByRole("button", { name: "作成" }));

    await waitFor(() => {
      expect(api.organizations[":id"].meetings.$post).toHaveBeenCalledWith(
        {
          param: { id: "org-1" },
          json: {
            name: "新規定例",
            scheduleCron: "0 10 * * 1",
            defaultDurationMinutes: 60,
          },
        },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });
});

describe("Sidebar ナビゲーション", () => {
  it("My タスクへの導線が /tasks で表示される", async () => {
    (api.organizations.$get as Mock).mockResolvedValue(mockJson(mockOrgs));

    renderSidebar();

    // ダッシュボードと同列に常に表示されるため、組織選択状態を待たずに描画される。
    const link = await screen.findByRole("link", { name: /My タスク/ });
    expect(link).toHaveAttribute("href", "/tasks");
  });
});
