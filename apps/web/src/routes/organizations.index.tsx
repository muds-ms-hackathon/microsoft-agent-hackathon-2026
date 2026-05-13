import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateOrganizationDialog } from "@/features/organizations/components/CreateOrganizationDialog";
import { RoleBadge } from "@/features/organizations/components/RoleBadge";
import type { Organization } from "@/features/organizations/types";
import { api, authHeaders } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/organizations/")({
  component: OrganizationsPage,
});

function OrganizationCard({ org }: { org: Organization }) {
  return (
    <Link
      to="/organizations/$id"
      params={{ id: org.id }}
      className="block transition-colors hover:bg-accent rounded-xl"
    >
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
      </Card>
    </Link>
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
      // Hono RPC client は第 2 引数で headers を受け取る。第 1 引数の input に
      // headers を入れても無視されるため、authHeaders() は必ず第 2 引数へ渡す。
      const res = await api.organizations.$get(undefined, authHeaders());
      // 認証失敗などで API が { error } を返した場合、配列でないものを
      // そのまま data に格納すると orgs.map() で落ちるため、ここで弾く。
      if (!res.ok) {
        throw new Error(`Failed to fetch organizations: ${res.status}`);
      }
      // Hono RPC のレスポンス型は date が string なので as でキャストする
      return (await res.json()) as Organization[];
    },
  });

  return (
    <section
      aria-labelledby="organizations-title"
      className="container mx-auto p-8 space-y-6"
    >
      <header className="flex items-center justify-between">
        <h1 id="organizations-title" className="text-2xl font-bold">
          組織一覧
        </h1>
        <CreateOrganizationDialog />
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
    </section>
  );
}
