import type {
  Member,
  OrganizationDetail,
} from "@/features/organizations/types";
import { OrganizationDetailView } from "@/routes/organizations.$id";
import { renderWithQuery } from "../test-utils";

// 組織詳細ページ系テスト (organizations.$id.test.tsx / 各 Dialog の test) で共有する
// fixtures と render ヘルパー。vi.mock は hoist の都合で各ファイルにインライン記述する必要があり、
// ここでは「データと描画」だけを集約する。

export const ownerOrgDetail: OrganizationDetail = {
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
      defaultDurationMinutes: 60,
      createdAt: "2026-05-03T00:00:00.000Z",
      updatedAt: "2026-05-03T00:00:00.000Z",
    },
  ],
};

export const sampleMembers: Member[] = [
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

// hono/client のレスポンス形を最小限で再現するヘルパーは helpers/mockJson から
// 再エクスポートする (組織詳細系テストが従来どおり helpers/organizationDetail
// から import できるよう互換のために残す)。
export { mockJson } from "./mockJson";

export function renderDetail(opts?: {
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
