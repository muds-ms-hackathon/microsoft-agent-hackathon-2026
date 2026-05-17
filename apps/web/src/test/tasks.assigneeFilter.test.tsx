import type { Member } from "@/features/organizations/types";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "./test-utils";

// useOrganizationMembers が呼び出す api を差し替える。
vi.mock("@/lib/api", () => ({
  api: {
    organizations: {
      ":id": {
        members: { $get: vi.fn() },
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

import { AssigneeFilter } from "@/features/tasks/components/AssigneeFilter";
import { api } from "@/lib/api";

function mockJson<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as never;
}

const members: Member[] = [
  {
    userId: "user-1",
    name: "alice",
    displayName: "Alice",
    email: "alice@example.com",
    role: "member",
    joinedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    userId: "user-2",
    name: "bob",
    displayName: "Bob",
    email: "bob@example.com",
    role: "member",
    joinedAt: "2026-01-01T00:00:00.000Z",
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AssigneeFilter", () => {
  it("基本の選択肢「すべて」「未アサイン」「メンバー」を表示する", async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(members),
    );

    renderWithQuery(
      <AssigneeFilter
        orgId="org-1"
        value={undefined}
        onChange={() => {}}
        currentUserEmail={null}
      />,
    );

    // メンバー取得を待つ
    expect(
      await screen.findByRole("option", { name: "Bob" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "すべて" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "未アサイン" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alice" })).toBeInTheDocument();
  });

  it("currentUserEmail がメンバーに一致すると「自分のみ」option を出し、メンバー一覧から自分を除外する", async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(members),
    );

    renderWithQuery(
      <AssigneeFilter
        orgId="org-1"
        value={undefined}
        onChange={() => {}}
        currentUserEmail="alice@example.com"
      />,
    );

    // members 取得が終わるまで待ってから、メンバー option の有無を判定する。
    expect(
      await screen.findByRole("option", { name: "Bob" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "自分のみ" }),
    ).toBeInTheDocument();
    // 自分 (alice) はメンバー一覧の Alice option として重複表示されない
    expect(screen.queryByRole("option", { name: "Alice" })).toBeNull();
  });

  it("「自分のみ」option の value は メンバー一覧から引いた userId である", async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(members),
    );
    const onChange = vi.fn();

    renderWithQuery(
      <AssigneeFilter
        orgId="org-1"
        value={undefined}
        onChange={onChange}
        currentUserEmail="alice@example.com"
      />,
    );

    const selfOption = (await screen.findByRole("option", {
      name: "自分のみ",
    })) as HTMLOptionElement;
    expect(selfOption.value).toBe("user-1");

    const select = screen.getByLabelText("担当者フィルタ");
    await userEvent.selectOptions(select, selfOption);
    // onChange には DB の user.id（userId）が渡るべき。
    expect(onChange).toHaveBeenCalledWith("user-1");
  });

  it("currentUserEmail が null のときは「自分のみ」option を表示しない", async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(members),
    );

    renderWithQuery(
      <AssigneeFilter
        orgId="org-1"
        value={undefined}
        onChange={() => {}}
        currentUserEmail={null}
      />,
    );

    await screen.findByRole("option", { name: "Bob" });
    expect(screen.queryByRole("option", { name: "自分のみ" })).toBeNull();
  });

  it("currentUserEmail がメンバーに見つからないときは「自分のみ」option を出さない", async () => {
    // 認証済みだが、当該組織のメンバーには含まれないケース。
    // members から userId を引けないため、「自分のみ」は非表示にする（正しい値が決まらないため）。
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(members),
    );

    renderWithQuery(
      <AssigneeFilter
        orgId="org-1"
        value={undefined}
        onChange={() => {}}
        currentUserEmail="outsider@example.com"
      />,
    );

    await screen.findByRole("option", { name: "Bob" });
    expect(screen.queryByRole("option", { name: "自分のみ" })).toBeNull();
    // 既存メンバーは普通に表示される
    expect(screen.getByRole("option", { name: "Alice" })).toBeInTheDocument();
  });

  it("メンバー option を選ぶと onChange に userId が渡る", async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(members),
    );
    const onChange = vi.fn();

    renderWithQuery(
      <AssigneeFilter
        orgId="org-1"
        value={undefined}
        onChange={onChange}
        currentUserEmail={null}
      />,
    );

    await screen.findByRole("option", { name: "Bob" });
    const select = screen.getByLabelText("担当者フィルタ");
    await userEvent.selectOptions(select, "user-2");
    expect(onChange).toHaveBeenCalledWith("user-2");
  });

  it("「すべて」を選ぶと onChange に undefined が渡る", async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(members),
    );
    const onChange = vi.fn();

    renderWithQuery(
      <AssigneeFilter
        orgId="org-1"
        value="user-2"
        onChange={onChange}
        currentUserEmail={null}
      />,
    );

    await screen.findByRole("option", { name: "Bob" });
    const select = screen.getByLabelText("担当者フィルタ");
    await userEvent.selectOptions(select, "");
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('「未アサイン」を選ぶと onChange に "none" が渡る', async () => {
    vi.mocked(api.organizations[":id"].members.$get).mockResolvedValue(
      mockJson(members),
    );
    const onChange = vi.fn();

    renderWithQuery(
      <AssigneeFilter
        orgId="org-1"
        value={undefined}
        onChange={onChange}
        currentUserEmail={null}
      />,
    );

    await screen.findByRole("option", { name: "Bob" });
    const select = screen.getByLabelText("担当者フィルタ");
    await userEvent.selectOptions(select, "none");
    expect(onChange).toHaveBeenCalledWith("none");
  });
});
