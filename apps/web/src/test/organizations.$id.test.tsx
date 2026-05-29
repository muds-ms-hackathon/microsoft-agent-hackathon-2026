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

// 組織詳細ページの「基本表示」と「定例 (RecurringMeeting) 系 Dialog」のテスト。
// 組織自身の 4 Dialog (招待 / 編集 / メンバー削除 / 組織削除) は
// `organizations.{inviteMemberDialog,editOrganizationDialog,deleteMemberDialog,deleteOrganizationDialog}.test.tsx`
// に分離している。

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

  it("定例一覧がカードで表示され、定例名・scheduleCron・所要時間・作成日を含む", async () => {
    renderDetail();
    const list = await screen.findByRole("list", { name: "定例一覧" });
    const cards = within(list).getAllByRole("listitem");
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(within(card).getByText("週次定例")).toBeInTheDocument();
    expect(within(card).getByText("0 10 * * 1")).toBeInTheDocument();
    expect(within(card).getByText("60 分")).toBeInTheDocument();
    expect(within(card).getByText(/2026/)).toBeInTheDocument();
  });

  it("定例カードに「会議一覧」リンクが表示され、/recurring-meetings/:id へ遷移する", async () => {
    renderDetail();
    const list = await screen.findByRole("list", { name: "定例一覧" });
    const card = within(list).getAllByRole("listitem")[0];
    const link = within(card).getByRole("link", { name: "会議一覧" });
    expect(link).toHaveAttribute("href", "/recurring-meetings/meet-1");
  });

  it("定例カードに description があれば表示される", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({
        ...ownerOrgDetail,
        recurringMeetings: [
          {
            ...ownerOrgDetail.recurringMeetings[0],
            description: "毎週月曜の進捗共有",
          },
        ],
      }),
    );
    renderDetail();
    expect(await screen.findByText("毎週月曜の進捗共有")).toBeInTheDocument();
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
    expect(await screen.findByText("ACME 株式会社")).toBeInTheDocument();
    expect(
      await screen.findByText("メンバーの取得に失敗しました"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "メンバー一覧" }),
    ).not.toBeInTheDocument();
  });
});

describe("組織詳細ページ - 定例作成ダイアログ", () => {
  beforeEach(() => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson(ownerOrgDetail),
    );
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(sampleMembers),
    );
  });

  it("「定例を作成」ボタンを押すとダイアログが開く", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "定例を作成" }));
    expect(
      await screen.findByRole("dialog", { name: "定例を作成" }),
    ).toBeInTheDocument();
  });

  it("定例作成ボタンは member ロールでも表示される（API 仕様: 組織メンバー全員可）", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({ ...ownerOrgDetail, role: "member" }),
    );
    renderDetail();
    expect(
      await screen.findByRole("button", { name: "定例を作成" }),
    ).toBeInTheDocument();
  });

  it("name 未入力で送信するとバリデーションエラー", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "定例を作成" }));
    const dialog = await screen.findByRole("dialog", { name: "定例を作成" });
    await user.click(within(dialog).getByRole("button", { name: "作成" }));
    expect(
      await within(dialog).findByText("定例名は必須です"),
    ).toBeInTheDocument();
    expect(api.organizations[":id"].meetings.$post).not.toHaveBeenCalled();
  });

  it("既定の開催頻度（毎週月曜 10:00）で送信される", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].meetings.$post).mockResolvedValue(
      mockJson(
        {
          id: "meet-new",
          organizationId: "org-1",
          name: "新規定例",
          description: null,
          scheduleCron: "0 10 * * 1",
          defaultDurationMinutes: 60,
          createdAt: "2026-05-15T00:00:00.000Z",
          updatedAt: "2026-05-15T00:00:00.000Z",
        },
        201,
      ),
    );
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "定例を作成" }));
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

  it("頻度を毎日に切り替えると cron が '0 10 * * *' に変わる", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].meetings.$post).mockResolvedValue(
      mockJson({ id: "meet-new" }, 201),
    );
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "定例を作成" }));
    const dialog = await screen.findByRole("dialog", { name: "定例を作成" });
    await user.type(within(dialog).getByLabelText("定例名"), "新規定例");
    await user.click(within(dialog).getByRole("radio", { name: "毎日" }));
    await user.click(within(dialog).getByRole("button", { name: "作成" }));
    await waitFor(() => {
      expect(api.organizations[":id"].meetings.$post).toHaveBeenCalledWith(
        {
          param: { id: "org-1" },
          json: {
            name: "新規定例",
            scheduleCron: "0 10 * * *",
            defaultDurationMinutes: 60,
          },
        },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it("所要時間プリセット 90 分を選ぶと defaultDurationMinutes が反映される", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].meetings.$post).mockResolvedValue(
      mockJson({ id: "meet-new" }, 201),
    );
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "定例を作成" }));
    const dialog = await screen.findByRole("dialog", { name: "定例を作成" });
    await user.type(within(dialog).getByLabelText("定例名"), "新規定例");
    await user.click(within(dialog).getByRole("radio", { name: "90 分" }));
    await user.click(within(dialog).getByRole("button", { name: "作成" }));
    await waitFor(() => {
      expect(api.organizations[":id"].meetings.$post).toHaveBeenCalledWith(
        {
          param: { id: "org-1" },
          json: {
            name: "新規定例",
            scheduleCron: "0 10 * * 1",
            defaultDurationMinutes: 90,
          },
        },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it("曜日（水）を追加すると cron に 3 が加わる", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].meetings.$post).mockResolvedValue(
      mockJson({ id: "meet-new" }, 201),
    );
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "定例を作成" }));
    const dialog = await screen.findByRole("dialog", { name: "定例を作成" });
    await user.type(within(dialog).getByLabelText("定例名"), "新規定例");
    await user.click(within(dialog).getByRole("button", { name: "水" }));
    await user.click(within(dialog).getByRole("button", { name: "作成" }));
    await waitFor(() => {
      expect(api.organizations[":id"].meetings.$post).toHaveBeenCalledWith(
        {
          param: { id: "org-1" },
          json: {
            name: "新規定例",
            scheduleCron: "0 10 * * 1,3",
            defaultDurationMinutes: 60,
          },
        },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it("description を入力するとペイロードに含まれる", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].meetings.$post).mockResolvedValue(
      mockJson({ id: "meet-new" }, 201),
    );
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "定例を作成" }));
    const dialog = await screen.findByRole("dialog", { name: "定例を作成" });
    await user.type(within(dialog).getByLabelText("定例名"), "新規定例");
    await user.type(within(dialog).getByLabelText("説明"), "毎週月曜");
    await user.click(within(dialog).getByRole("button", { name: "作成" }));
    await waitFor(() => {
      expect(api.organizations[":id"].meetings.$post).toHaveBeenCalledWith(
        {
          param: { id: "org-1" },
          json: {
            name: "新規定例",
            description: "毎週月曜",
            scheduleCron: "0 10 * * 1",
            defaultDurationMinutes: 60,
          },
        },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it("API エラー時はダイアログ内にエラーメッセージを表示する", async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizations[":id"].meetings.$post).mockResolvedValue(
      mockJson({ error: "サーバーエラー" }, 500),
    );
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "定例を作成" }));
    const dialog = await screen.findByRole("dialog", { name: "定例を作成" });
    await user.type(within(dialog).getByLabelText("定例名"), "新規定例");
    await user.click(within(dialog).getByRole("button", { name: "作成" }));
    expect(
      await within(dialog).findByText("定例の作成に失敗しました"),
    ).toBeInTheDocument();
  });
});

describe("組織詳細ページ - 定例編集ダイアログ", () => {
  beforeEach(() => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson(ownerOrgDetail),
    );
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(sampleMembers),
    );
  });

  it("定例カードの「編集」ボタンを押すとダイアログが開き、ビルダー UI に既存値が反映される", async () => {
    const user = userEvent.setup();
    renderDetail();
    const card = (
      await screen.findByRole("list", { name: "定例一覧" })
    ).querySelector("li");
    if (!card) throw new Error("card not found");
    await user.click(
      within(card as HTMLElement).getByRole("button", { name: "編集" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "定例を編集" });
    expect(within(dialog).getByLabelText("定例名")).toHaveValue("週次定例");
    const preview = within(dialog).getByLabelText("開催頻度プレビュー");
    expect(preview).toHaveTextContent("毎週 月 10:00");
  });

  it("name のみ変更して保存すると差分のみが送信される", async () => {
    const user = userEvent.setup();
    vi.mocked(api["recurring-meetings"][":id"].$patch).mockResolvedValue(
      mockJson({
        ...ownerOrgDetail.recurringMeetings[0],
        name: "新しい定例名",
      }),
    );
    renderDetail();
    const list = await screen.findByRole("list", { name: "定例一覧" });
    await user.click(
      within(list.querySelector("li") as HTMLElement).getByRole("button", {
        name: "編集",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "定例を編集" });
    const nameInput = within(dialog).getByLabelText("定例名");
    await user.clear(nameInput);
    await user.type(nameInput, "新しい定例名");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(api["recurring-meetings"][":id"].$patch).toHaveBeenCalledWith(
        { param: { id: "meet-1" }, json: { name: "新しい定例名" } },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "定例を編集" }),
      ).not.toBeInTheDocument();
    });
  });

  it("変更が無い場合は API を呼ばずに閉じる", async () => {
    const user = userEvent.setup();
    renderDetail();
    const list = await screen.findByRole("list", { name: "定例一覧" });
    await user.click(
      within(list.querySelector("li") as HTMLElement).getByRole("button", {
        name: "編集",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "定例を編集" });
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "定例を編集" }),
      ).not.toBeInTheDocument();
    });
    expect(api["recurring-meetings"][":id"].$patch).not.toHaveBeenCalled();
  });

  it("所要時間プリセット 90 分を選んで保存すると defaultDurationMinutes が差分送信される", async () => {
    const user = userEvent.setup();
    vi.mocked(api["recurring-meetings"][":id"].$patch).mockResolvedValue(
      mockJson({
        ...ownerOrgDetail.recurringMeetings[0],
        defaultDurationMinutes: 90,
      }),
    );
    renderDetail();
    const list = await screen.findByRole("list", { name: "定例一覧" });
    await user.click(
      within(list.querySelector("li") as HTMLElement).getByRole("button", {
        name: "編集",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "定例を編集" });
    await user.click(within(dialog).getByRole("radio", { name: "90 分" }));
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(api["recurring-meetings"][":id"].$patch).toHaveBeenCalledWith(
        { param: { id: "meet-1" }, json: { defaultDurationMinutes: 90 } },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it("頻度を毎日に切り替えて保存すると scheduleCron が差分送信される", async () => {
    const user = userEvent.setup();
    vi.mocked(api["recurring-meetings"][":id"].$patch).mockResolvedValue(
      mockJson({
        ...ownerOrgDetail.recurringMeetings[0],
        scheduleCron: "0 10 * * *",
      }),
    );
    renderDetail();
    const list = await screen.findByRole("list", { name: "定例一覧" });
    await user.click(
      within(list.querySelector("li") as HTMLElement).getByRole("button", {
        name: "編集",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "定例を編集" });
    await user.click(within(dialog).getByRole("radio", { name: "毎日" }));
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(api["recurring-meetings"][":id"].$patch).toHaveBeenCalledWith(
        { param: { id: "meet-1" }, json: { scheduleCron: "0 10 * * *" } },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it("ビルダーで表現できない cron はカスタム入力フィールドで編集できる", async () => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson({
        ...ownerOrgDetail,
        recurringMeetings: [
          {
            ...ownerOrgDetail.recurringMeetings[0],
            scheduleCron: "0 10 * * 1-5",
          },
        ],
      }),
    );
    const user = userEvent.setup();
    renderDetail();
    const list = await screen.findByRole("list", { name: "定例一覧" });
    await user.click(
      within(list.querySelector("li") as HTMLElement).getByRole("button", {
        name: "編集",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "定例を編集" });
    const fallback = within(dialog).getByLabelText("開催頻度（cron 形式）");
    expect(fallback).toHaveValue("0 10 * * 1-5");
    expect(
      within(dialog).queryByLabelText("開催頻度プレビュー"),
    ).not.toBeInTheDocument();
  });

  it("API エラー時はダイアログ内にエラーメッセージを表示する", async () => {
    const user = userEvent.setup();
    vi.mocked(api["recurring-meetings"][":id"].$patch).mockResolvedValue(
      mockJson({ error: "サーバーエラー" }, 500),
    );
    renderDetail();
    const list = await screen.findByRole("list", { name: "定例一覧" });
    await user.click(
      within(list.querySelector("li") as HTMLElement).getByRole("button", {
        name: "編集",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "定例を編集" });
    const nameInput = within(dialog).getByLabelText("定例名");
    await user.clear(nameInput);
    await user.type(nameInput, "別の名前");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    expect(
      await within(dialog).findByText("定例の更新に失敗しました"),
    ).toBeInTheDocument();
  });
});

describe("組織詳細ページ - 定例削除ダイアログ", () => {
  beforeEach(() => {
    vi.mocked(api.organizations[":id"].$get).mockResolvedValue(
      mockJson(ownerOrgDetail),
    );
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(sampleMembers),
    );
  });

  it("定例カードに「削除」ボタンが表示され、押すと確認ダイアログが開く", async () => {
    const user = userEvent.setup();
    renderDetail();
    const list = await screen.findByRole("list", { name: "定例一覧" });
    const card = list.querySelector("li") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "削除" }));
    expect(
      await screen.findByRole("dialog", { name: "定例を削除" }),
    ).toBeInTheDocument();
  });

  it("確認ダイアログで「削除を実行」を押すと API が呼ばれてダイアログが閉じる", async () => {
    const user = userEvent.setup();
    vi.mocked(api["recurring-meetings"][":id"].$delete).mockResolvedValue(
      mockJson(null, 204),
    );
    renderDetail();
    const list = await screen.findByRole("list", { name: "定例一覧" });
    const card = list.querySelector("li") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "削除" }));
    const dialog = await screen.findByRole("dialog", { name: "定例を削除" });
    await user.click(
      within(dialog).getByRole("button", { name: "削除を実行" }),
    );
    await waitFor(() => {
      expect(api["recurring-meetings"][":id"].$delete).toHaveBeenCalledWith(
        { param: { id: "meet-1" } },
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "定例を削除" }),
      ).not.toBeInTheDocument();
    });
  });

  it("403 が返った場合は「削除権限がありません」を表示する", async () => {
    const user = userEvent.setup();
    vi.mocked(api["recurring-meetings"][":id"].$delete).mockResolvedValue(
      mockJson({ error: "削除権限がありません" }, 403),
    );
    renderDetail();
    const list = await screen.findByRole("list", { name: "定例一覧" });
    const card = list.querySelector("li") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "削除" }));
    const dialog = await screen.findByRole("dialog", { name: "定例を削除" });
    await user.click(
      within(dialog).getByRole("button", { name: "削除を実行" }),
    );
    expect(
      await within(dialog).findByText(
        "削除権限がありません（定例のオーナーのみ削除可能です）",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "定例を削除" }),
    ).toBeInTheDocument();
  });

  it("403 以外のエラーは汎用メッセージを表示する", async () => {
    const user = userEvent.setup();
    vi.mocked(api["recurring-meetings"][":id"].$delete).mockResolvedValue(
      mockJson({ error: "internal" }, 500),
    );
    renderDetail();
    const list = await screen.findByRole("list", { name: "定例一覧" });
    const card = list.querySelector("li") as HTMLElement;
    await user.click(within(card).getByRole("button", { name: "削除" }));
    const dialog = await screen.findByRole("dialog", { name: "定例を削除" });
    await user.click(
      within(dialog).getByRole("button", { name: "削除を実行" }),
    );
    expect(
      await within(dialog).findByText("定例の削除に失敗しました"),
    ).toBeInTheDocument();
  });
});
