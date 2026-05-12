import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationDetailView } from "../routes/organizations.$id";
import { renderWithQuery } from "./test-utils";

// Hono RPC api モジュールをモック。$get は input によって組織詳細・メンバー一覧
// の双方を受け取るため、テストごとに mockImplementation で振り分ける。
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
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

import { api } from "@/lib/api";

function mockJson<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as never;
}

type OrgRole = "owner" | "admin" | "member";

type Member = {
  userId: string;
  name: string;
  displayName: string;
  email: string;
  role: OrgRole;
  joinedAt: string;
};

type RecurringMeeting = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  scheduleCron: string;
  createdAt: string;
  updatedAt: string;
};

type OrganizationDetail = {
  id: string;
  name: string;
  description: string | null;
  role: OrgRole;
  createdAt: string;
  updatedAt: string;
  recurringMeetings: RecurringMeeting[];
};

const ownerOrgDetail: OrganizationDetail = {
  id: "org-1",
  name: "ACME 株式会社",
  description: "テスト組織の説明",
  role: "owner",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  recurringMeetings: [
    {
      id: "meet-1",
      organizationId: "org-1",
      name: "週次定例",
      description: null,
      scheduleCron: "0 10 * * 1",
      createdAt: "2026-05-03T00:00:00.000Z",
      updatedAt: "2026-05-03T00:00:00.000Z",
    },
  ],
};

const sampleMembers: Member[] = [
  {
    userId: "user-1",
    name: "alice",
    displayName: "Alice A.",
    email: "alice@example.com",
    role: "owner",
    joinedAt: "2026-05-01T00:00:00.000Z",
  },
  {
    userId: "user-2",
    name: "bob",
    displayName: "Bob B.",
    email: "bob@example.com",
    role: "admin",
    joinedAt: "2026-05-03T00:00:00.000Z",
  },
  {
    userId: "user-3",
    name: "carol",
    displayName: "Carol C.",
    email: "carol@example.com",
    role: "member",
    joinedAt: "2026-05-05T00:00:00.000Z",
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDetail(opts?: {
  id?: string;
  currentUserEmail?: string | null;
  onOrganizationDeleted?: () => void;
}) {
  return renderWithQuery(
    <OrganizationDetailView
      id={opts?.id ?? "org-1"}
      currentUserEmail={opts?.currentUserEmail ?? "alice@example.com"}
      onOrganizationDeleted={opts?.onOrganizationDeleted ?? (() => {})}
    />,
  );
}

// ===== 表示系 =====

describe("組織詳細ページ - 基本表示", () => {
  beforeEach(() => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson(ownerOrgDetail),
    );
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(sampleMembers),
    );
  });

  it("組織名・説明・role バッジが表示される", async () => {
    renderDetail();
    expect(await screen.findByText("ACME 株式会社")).toBeInTheDocument();
    expect(screen.getByText("テスト組織の説明")).toBeInTheDocument();
    // owner ロールラベル
    expect(screen.getAllByText("オーナー").length).toBeGreaterThan(0);
  });

  it("メンバー一覧が role バッジ付きで表示される", async () => {
    renderDetail();
    const memberList = await screen.findByRole("list", {
      name: "メンバー一覧",
    });
    expect(within(memberList).getByText("Alice A.")).toBeInTheDocument();
    expect(within(memberList).getByText("Bob B.")).toBeInTheDocument();
    expect(within(memberList).getByText("Carol C.")).toBeInTheDocument();
    expect(within(memberList).getByText("管理者")).toBeInTheDocument();
    expect(within(memberList).getByText("メンバー")).toBeInTheDocument();
  });

  it("定例一覧が表示される", async () => {
    renderDetail();
    expect(await screen.findByText("週次定例")).toBeInTheDocument();
  });

  it("定例が 0 件のときは空状態メッセージが表示される", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, recurringMeetings: [] }),
    );
    renderDetail();
    expect(await screen.findByText("定例はまだありません")).toBeInTheDocument();
  });

  it("組織取得が失敗するとエラー表示が出る", async () => {
    vi.mocked(api.organizations[":id"].$get).mockRejectedValue(
      new Error("network"),
    );
    renderDetail();
    expect(await screen.findByText("取得に失敗しました")).toBeInTheDocument();
  });

  it("4xx 応答でもエラー表示にフォールバックする", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ error: "不明" }, 404),
    );
    renderDetail();
    expect(await screen.findByText("取得に失敗しました")).toBeInTheDocument();
  });

  it("メンバー取得だけが失敗した場合、メンバー欄に専用のエラー表示が出る", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson(ownerOrgDetail),
    );
    vi.mocked(api.organizations[":id"].members.$get).mockRejectedValue(
      new Error("network"),
    );
    renderDetail();
    // 組織情報は通常通り表示される
    expect(await screen.findByText("ACME 株式会社")).toBeInTheDocument();
    // メンバー一覧 ul は描画されず、エラーメッセージのみ
    expect(
      await screen.findByText("メンバーの取得に失敗しました"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "メンバー一覧" }),
    ).not.toBeInTheDocument();
  });
});

// ===== 権限制御（招待ボタン） =====

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
    // ヘッダーが描画されるまで待ってから招待ボタンが無いことを確認する
    await screen.findByText("ACME 株式会社");
    expect(
      screen.queryByRole("button", { name: "メンバーを招待" }),
    ).not.toBeInTheDocument();
  });
});

// ===== 招待ダイアログ =====

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

// ===== 権限制御（編集ボタン） =====

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

// ===== 編集ダイアログ =====

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
    // description: null の組織で開く
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
    // 差分送信のため、API を呼ばせるには値を変更する必要がある
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
    // 初回は元の name、保存成功後の refetch では新しい name を返すよう切り替える
    const updatedOrg = { ...ownerOrgDetail, name: "更新後の組織名" };
    vi.mocked(api.organizations[":id"].$get)
      .mockResolvedValueOnce(mockJson(ownerOrgDetail))
      .mockResolvedValue(mockJson(updatedOrg));
    vi.mocked(api.organizations[":id"].$patch).mockResolvedValue(
      mockJson(updatedOrg),
    );

    renderDetail();
    // 1 回目: 編集して保存 → ダイアログ閉じる
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
    // ヘッダーが新しい name を反映したことを確認（refetch 完了の指標）
    await screen.findByText("更新後の組織名");

    // 2 回目: ダイアログを再オープン → 新しい name が初期値として表示されるはず
    await user.click(screen.getByRole("button", { name: "組織情報を編集" }));
    const dialog2 = await screen.findByRole("dialog", {
      name: "組織情報を編集",
    });
    expect(within(dialog2).getByLabelText("組織名")).toHaveValue(
      "更新後の組織名",
    );
  });
});

// ===== メンバー削除（権限制御） =====

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
    // currentUser = alice (owner)。bob/carol の行に削除ボタンが出るはず。
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
    // 自分自身 (Alice) の行には削除ボタンが出ない
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

// ===== メンバー削除（確認ダイアログ） =====

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

// ===== 組織削除（権限制御） =====

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

// ===== 組織削除（タイプ確認ダイアログ） =====

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
