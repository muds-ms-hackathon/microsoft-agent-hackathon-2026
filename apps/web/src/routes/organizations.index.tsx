import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateOrganizationDialog } from "@/features/organizations/components/CreateOrganizationDialog";
import { RoleBadge } from "@/features/organizations/components/RoleBadge";
import {
  type OrganizationListItem,
  useOrganizationsQuery,
} from "@/features/organizations/hooks/useOrganizationsQuery";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/organizations/")({
  component: OrganizationsPage,
});

function OrganizationCard({ org }: { org: OrganizationListItem }) {
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
  // クエリキー・fetcher は Sidebar と共通フックで共有しており、
  // 一方の invalidate がもう一方にも反映される。
  // 認証失敗などで API が { error } を返した場合、queryFn 内で throw され
  // isError 経路に流れるため、orgs.map() で落ちる事故は起きない。
  const { data: orgs = [], isLoading, isError } = useOrganizationsQuery();

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
