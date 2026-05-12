import { api, authHeaders } from "@/lib/api";
import { authAtom } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";

export const Route = createFileRoute("/organizations/$id")({
  component: OrganizationDetailPage,
});

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

const roleLabels: Record<OrgRole, string> = {
  owner: "オーナー",
  admin: "管理者",
  member: "メンバー",
};

function RoleBadge({ role }: { role: OrgRole }) {
  return (
    <span className="inline-flex items-center rounded-md border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      {roleLabels[role]}
    </span>
  );
}

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
  currentUserEmail: _currentUserEmail,
  onOrganizationDeleted: _onOrganizationDeleted,
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
      <main className="container mx-auto p-8">
        <p>読み込み中...</p>
      </main>
    );
  }
  if (orgQuery.isError || !orgQuery.data) {
    return (
      <main className="container mx-auto p-8">
        <p>取得に失敗しました</p>
      </main>
    );
  }

  const org = orgQuery.data;
  const members = membersQuery.data ?? [];

  return (
    <main className="container mx-auto p-8 space-y-6">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{org.name}</h1>
          <RoleBadge role={org.role} />
        </div>
        {org.description ? (
          <p className="text-muted-foreground">{org.description}</p>
        ) : null}
      </header>

      <section aria-label="メンバー" className="space-y-3">
        <h2 className="text-lg font-semibold">メンバー</h2>
        <ul aria-label="メンバー一覧" className="divide-y rounded-md border">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="font-medium">{m.displayName}</span>
                <span className="text-sm text-muted-foreground">{m.email}</span>
              </div>
              <RoleBadge role={m.role} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="定例" className="space-y-3">
        <h2 className="text-lg font-semibold">定例</h2>
        {org.recurringMeetings.length === 0 ? (
          <p className="text-muted-foreground">定例はまだありません</p>
        ) : (
          <ul aria-label="定例一覧" className="divide-y rounded-md border">
            {org.recurringMeetings.map((meeting) => (
              <li key={meeting.id} className="px-4 py-3">
                <span className="font-medium">{meeting.name}</span>
                {meeting.description ? (
                  <span className="ml-2 text-sm text-muted-foreground">
                    {meeting.description}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
