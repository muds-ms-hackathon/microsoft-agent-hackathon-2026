import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/organizations")({
  component: OrganizationsPage,
});

type OrgRole = "owner" | "admin" | "member";

type Organization = {
  id: string;
  name: string;
  description: string | null;
  role: OrgRole;
  createdAt: string;
  updatedAt: string;
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

function OrganizationCard({ org }: { org: Organization }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{org.name}</CardTitle>
          <RoleBadge role={org.role} />
        </div>
        {org.description ? (
          <CardDescription>{org.description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent />
    </Card>
  );
}

export function OrganizationsPage() {
  const {
    data: orgs = [],
    isLoading,
    isError,
  } = useQuery<Organization[]>({
    queryKey: ["organizations"],
    queryFn: async () => {
      const res = await api.organizations.$get(authHeaders());
      // Hono RPC のレスポンス型は date が string なので as でキャストする
      return (await res.json()) as Organization[];
    },
  });

  return (
    <main className="container mx-auto p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">組織一覧</h1>
      </header>

      {isLoading ? (
        <p>読み込み中...</p>
      ) : isError ? (
        <p>取得に失敗しました</p>
      ) : orgs.length === 0 ? (
        <p className="text-muted-foreground">所属している組織がありません</p>
      ) : (
        <ul aria-label="組織一覧" className="grid gap-4 sm:grid-cols-2">
          {orgs.map((org) => (
            <li key={org.id}>
              <OrganizationCard org={org} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
