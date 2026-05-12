import { screen, within } from "@testing-library/react";
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
});
