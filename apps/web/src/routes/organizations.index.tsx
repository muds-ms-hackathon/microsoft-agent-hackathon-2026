import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, authHeaders } from "@/lib/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

export const Route = createFileRoute("/organizations/")({
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

// ===== 作成フォーム =====

const createSchema = z.object({
  name: z.string().min(1, "組織名は必須です"),
  description: z.string().optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;

function CreateOrganizationDialog() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const nameId = useId();
  const descriptionId = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", description: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateFormValues) => {
      // description は空文字なら API に渡さない（API 側 schema が optional のため）
      const json: { name: string; description?: string } = { name: data.name };
      if (data.description && data.description.length > 0) {
        json.description = data.description;
      }
      // headers は第 2 引数で渡す（第 1 引数に混ぜると無視される）。
      const res = await api.organizations.$post({ json }, authHeaders());
      // 非 2xx を success として扱うと、API が 400/401/500 を返した場合でも
      // Dialog が閉じてしまい、ユーザーが成功したと誤認する。res.ok を見て
      // エラー扱いに落とし、useMutation の onError / isError 経路に流す。
      if (!res.ok) {
        throw new Error(`Failed to create organization: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      reset();
      setOpen(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>組織を作成</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新しい組織を作成</DialogTitle>
          <DialogDescription>
            組織名と説明（任意）を入力してください。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>組織名</Label>
            <Input
              id={nameId}
              placeholder="例: ACME 株式会社"
              {...register("name")}
            />
            {errors.name && (
              <p role="alert" className="text-destructive text-sm">
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={descriptionId}>説明</Label>
            <Input
              id={descriptionId}
              placeholder="組織の説明（任意）"
              {...register("description")}
            />
          </div>
          {mutation.isError && (
            <p className="text-destructive text-sm">作成に失敗しました</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              作成
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    <main className="container mx-auto p-8 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">組織一覧</h1>
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
    </main>
  );
}
