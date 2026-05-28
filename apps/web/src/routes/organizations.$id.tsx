import { RetryButton } from "@/components/ui/RetryButton";
import { DeleteMemberDialog } from "@/features/organizations/components/DeleteMemberDialog";
import { DeleteOrganizationDialog } from "@/features/organizations/components/DeleteOrganizationDialog";
import { EditOrganizationDialog } from "@/features/organizations/components/EditOrganizationDialog";
import { InviteMemberDialog } from "@/features/organizations/components/InviteMemberDialog";
import { PendingInvitationsList } from "@/features/organizations/components/PendingInvitationsList";
import { RoleBadge } from "@/features/organizations/components/RoleBadge";
import type {
  Member,
  OrganizationDetail,
} from "@/features/organizations/types";
import { CreateRecurringMeetingDialog } from "@/features/recurring-meetings/components/CreateRecurringMeetingDialog";
import { DeleteRecurringMeetingDialog } from "@/features/recurring-meetings/components/DeleteRecurringMeetingDialog";
import { EditRecurringMeetingDialog } from "@/features/recurring-meetings/components/EditRecurringMeetingDialog";
import { RecurringMeetingCard } from "@/features/recurring-meetings/components/RecurringMeetingCard";
import { api, authHeaders } from "@/lib/api";
import { authAtom } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/organizations/$id")({
  component: OrganizationDetailPage,
});

function OrganizationDetailPage() {
  const { id } = Route.useParams();
  const auth = useAtomValue(authAtom);
  const navigate = useNavigate();
  return (
    <OrganizationDetailView
      id={id}
      currentUserEmail={auth.user?.email ?? null}
      onOrganizationDeleted={() => navigate({ to: "/organizations" })}
    />
  );
}

export function OrganizationDetailView({
  id,
  currentUserEmail,
  onOrganizationDeleted,
}: {
  id: string;
  currentUserEmail: string | null;
  onOrganizationDeleted: () => void;
}) {
  const orgQuery = useQuery<OrganizationDetail>({
    queryKey: ["organizations", id],
    queryFn: async () => {
      const res = await api.organizations[":id"].$get(
        { param: { id } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch organization: ${res.status}`);
      }
      return (await res.json()) as OrganizationDetail;
    },
  });

  const membersQuery = useQuery<Member[]>({
    queryKey: ["organizations", id, "members"],
    queryFn: async () => {
      const res = await api.organizations[":id"].members.$get(
        { param: { id } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch members: ${res.status}`);
      }
      return (await res.json()) as Member[];
    },
  });

  if (orgQuery.isLoading) {
    return (
      <div className="container mx-auto p-8">
        <p>読み込み中...</p>
      </div>
    );
  }
  if (orgQuery.isError || !orgQuery.data) {
    return (
      <div className="container mx-auto p-8">
        <p>取得に失敗しました</p>
      </div>
    );
  }

  const org = orgQuery.data;
  const members = membersQuery.data ?? [];

  return (
    <section
      aria-labelledby="organization-detail-title"
      className="container mx-auto p-8 space-y-6"
    >
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h1 id="organization-detail-title" className="text-2xl font-bold">
              {org.name}
            </h1>
            <RoleBadge role={org.role} />
          </div>
          {(org.role === "owner" || org.role === "admin") && (
            <EditOrganizationDialog org={org} />
          )}
        </div>
        {org.description ? (
          <p className="text-muted-foreground">{org.description}</p>
        ) : null}
      </header>

      <section aria-label="メンバー" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">メンバー</h2>
          {(org.role === "owner" || org.role === "admin") && (
            <InviteMemberDialog orgId={id} />
          )}
        </div>
        {membersQuery.isError ? (
          // members だけ取得失敗したケース。空配列にフォールバックすると
          // 「メンバーが 0 人」に見えてしまうため、明示的にエラー表示する。
          <div className="flex items-center gap-1">
            <p className="text-sm text-destructive">
              メンバーの取得に失敗しました
            </p>
            <RetryButton onClick={() => membersQuery.refetch()} />
          </div>
        ) : (
          <ul aria-label="メンバー一覧" className="divide-y rounded-md border">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{m.displayName}</span>
                  <span className="text-sm text-muted-foreground">
                    {m.email}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge role={m.role} />
                  {org.role === "owner" && m.email !== currentUserEmail && (
                    <DeleteMemberDialog orgId={id} member={m} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(org.role === "owner" || org.role === "admin") && (
        <PendingInvitationsList orgId={id} />
      )}

      <section aria-label="定例" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">定例</h2>
          <CreateRecurringMeetingDialog orgId={id} />
        </div>
        {org.recurringMeetings.length === 0 ? (
          <p className="text-muted-foreground">定例はまだありません</p>
        ) : (
          <ul
            aria-label="定例一覧"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {org.recurringMeetings.map((meeting) => (
              <RecurringMeetingCard
                key={meeting.id}
                meeting={meeting}
                actions={
                  <>
                    <Link
                      to="/recurring-meetings/$id"
                      params={{ id: meeting.id }}
                      className="text-sm text-primary hover:underline"
                    >
                      会議一覧
                    </Link>
                    <EditRecurringMeetingDialog meeting={meeting} />
                    <DeleteRecurringMeetingDialog meeting={meeting} />
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>

      {org.role === "owner" && (
        <section
          aria-label="危険な操作"
          className="space-y-3 rounded-md border border-destructive/30 p-4"
        >
          <h2 className="text-lg font-semibold text-destructive">危険な操作</h2>
          <p className="text-sm text-muted-foreground">
            組織を削除すると、関連する定例とメンバーシップもすべて失われます。
          </p>
          <DeleteOrganizationDialog
            org={org}
            onDeleted={onOrganizationDeleted}
          />
        </section>
      )}
    </section>
  );
}
