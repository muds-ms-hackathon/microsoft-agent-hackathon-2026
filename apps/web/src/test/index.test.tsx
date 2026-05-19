import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "./test-utils";

vi.mock("@/lib/api", () => ({
  api: {
    organizations: {
      ":id": {
        meetings: {
          $get: vi.fn(),
        },
      },
    },
    "recurring-meetings": {
      ":id": {
        meetings: {
          $get: vi.fn(),
        },
      },
    },
  },
  authHeaders: () => ({ headers: {} }),
}));

// Link は RouterProvider 配下でないと useRouter で落ちるためモック。
// recurring-meetings.$id.test と同じ方式。
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
    createFileRoute: () => () => ({}),
  };
});

// currentOrganizationIdAtom は atomWithStorage で global store に残るため、
// useAtomValue をモックして各テストで値を制御する。
vi.mock("jotai", async () => {
  const actual = await vi.importActual<typeof import("jotai")>("jotai");
  return { ...actual, useAtomValue: vi.fn() };
});

import { api } from "@/lib/api";
import { useAtomValue } from "jotai";
import { Dashboard } from "../routes/index";

function mockJson<T>(data: T, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as never;
}

// fake timer を避けるため、現在時刻より確実に未来・過去の日時を使う
const NEAR_FUTURE = "2099-01-01T10:00:00.000Z";
const FAR_FUTURE = "2099-06-01T10:00:00.000Z";
const PAST = "2000-01-01T10:00:00.000Z";

const RM_1 = { id: "rm-1", name: "週次定例", _count: { members: 0 } };
const RM_2 = { id: "rm-2", name: "月次レビュー", _count: { members: 0 } };

afterEach(() => {
  vi.restoreAllMocks();
});

function render() {
  return renderWithQuery(<Dashboard />);
}

// ===== 組織未選択 =====

describe("Dashboard - 組織未選択", () => {
  beforeEach(() => {
    vi.mocked(useAtomValue).mockReturnValue(null);
  });

  it("「サイドバーから組織を選択してください」が表示される", () => {
    render();
    expect(
      screen.getByText("サイドバーから組織を選択してください"),
    ).toBeInTheDocument();
  });
});

// ===== NextMeetingsSection =====

describe("Dashboard - NextMeetingsSection", () => {
  beforeEach(() => {
    vi.mocked(useAtomValue).mockReturnValue("org-1");
  });

  it("全定例が空のとき「予定されている会議はありません」が表示される", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([]),
    );
    render();
    expect(
      await screen.findByText("予定されている会議はありません"),
    ).toBeInTheDocument();
  });

  it("過去会議のみの定例は upcoming から除外され「予定されている会議はありません」が表示される", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([RM_1]),
    );
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockResolvedValue(
      mockJson([
        {
          id: "mtg-past",
          title: "過去の会議",
          heldAt: PAST,
          estimatedDurationMinutes: 60,
          recurringMeetingId: "rm-1",
        },
      ]),
    );
    render();
    expect(
      await screen.findByText("予定されている会議はありません"),
    ).toBeInTheDocument();
  });

  it("複数定例のうち heldAt が最も近い upcoming 会議の定例名が表示される", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([RM_1, RM_2]),
    );
    // rm-1 は遠い未来、rm-2 は近い未来 → rm-2 が選ばれる
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get)
      .mockResolvedValueOnce(
        mockJson([
          {
            id: "mtg-rm1",
            title: "週次定例 会議",
            heldAt: FAR_FUTURE,
            estimatedDurationMinutes: 60,
            recurringMeetingId: "rm-1",
          },
        ]),
      )
      .mockResolvedValueOnce(
        mockJson([
          {
            id: "mtg-rm2",
            title: "月次レビュー 会議",
            heldAt: NEAR_FUTURE,
            estimatedDurationMinutes: 60,
            recurringMeetingId: "rm-2",
          },
        ]),
      );
    render();
    expect(await screen.findByText("月次レビュー")).toBeInTheDocument();
  });

  it("定例取得が失敗したとき「定例の取得に失敗しました」が表示される", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockRejectedValue(
      new Error("network"),
    );
    render();
    expect(
      await screen.findByText("定例の取得に失敗しました"),
    ).toBeInTheDocument();
  });

  it("会議取得が失敗したとき「定例の取得に失敗しました」が表示される", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([RM_1]),
    );
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get).mockRejectedValue(
      new Error("network"),
    );
    render();
    expect(
      await screen.findByText("定例の取得に失敗しました"),
    ).toBeInTheDocument();
  });

  it("「詳細」リンクが最も直近の定例の id のページに向いている", async () => {
    vi.mocked(api.organizations[":id"].meetings.$get).mockResolvedValue(
      mockJson([RM_1, RM_2]),
    );
    // rm-2 の方が近い → 詳細リンクは /recurring-meetings/rm-2
    vi.mocked(api["recurring-meetings"][":id"].meetings.$get)
      .mockResolvedValueOnce(
        mockJson([
          {
            id: "mtg-rm1",
            title: "週次定例 会議",
            heldAt: FAR_FUTURE,
            estimatedDurationMinutes: 60,
            recurringMeetingId: "rm-1",
          },
        ]),
      )
      .mockResolvedValueOnce(
        mockJson([
          {
            id: "mtg-rm2",
            title: "月次レビュー 会議",
            heldAt: NEAR_FUTURE,
            estimatedDurationMinutes: 60,
            recurringMeetingId: "rm-2",
          },
        ]),
      );
    render();
    const link = await screen.findByRole("link", { name: /詳細/ });
    expect(link).toHaveAttribute("href", "/recurring-meetings/rm-2");
  });
});
