import { Button } from "@/components/ui/button";
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
import { RoleBadge } from "@/features/organizations/components/RoleBadge";
import type {
  Member,
  OrganizationDetail,
} from "@/features/organizations/types";
import { api, authHeaders } from "@/lib/api";
import { authAtom } from "@/lib/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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

// ===== 組織削除確認ダイアログ =====

function DeleteOrganizationDialog({
  org,
  onDeleted,
}: {
  org: { id: string; name: string };
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const confirmId = useId();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.organizations[":id"].$delete(
        { param: { id: org.id } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to delete organization: ${res.status}`);
      }
    },
    onSuccess: () => {
      // 組織が消えた状態でこのページに留まると詳細取得が 404 になるため、
      // 一覧へ遷移する責務は親に委譲する。
      onDeleted();
    },
  });

  const matches = confirmText === org.name;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmText("");
          mutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">組織を削除</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>組織を削除</DialogTitle>
          <DialogDescription>
            この操作は取り消せません。関連する定例・メンバーシップもすべて削除されます。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={confirmId}>確認のため組織名を入力してください</Label>
          <Input
            id={confirmId}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={org.name}
          />
        </div>
        {mutation.isError && (
          <p className="text-destructive text-sm">削除に失敗しました</p>
        )}
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!matches || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            削除を実行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== メンバー削除確認ダイアログ =====

function DeleteMemberDialog({
  orgId,
  member,
}: {
  orgId: string;
  member: { userId: string; displayName: string };
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await api.organizations[":id"].members[":userId"].$delete(
        { param: { id: orgId, userId: member.userId } },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to delete member: ${res.status}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", orgId, "members"],
      });
      setOpen(false);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) mutation.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          {`${member.displayName} を削除`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>メンバーを削除</DialogTitle>
          <DialogDescription>
            {`${member.displayName} さんを組織から削除しますか？この操作は取り消せません。`}
          </DialogDescription>
        </DialogHeader>
        {mutation.isError && (
          <p className="text-destructive text-sm">削除に失敗しました</p>
        )}
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            削除する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===== 編集ダイアログ =====

const editSchema = z.object({
  name: z.string().min(1, "組織名は必須です"),
  // 空文字を許容することで API 側で「説明をクリア」を表現できる。
  description: z.string(),
});

type EditFormValues = z.infer<typeof editSchema>;

function EditOrganizationDialog({
  org,
}: {
  org: { id: string; name: string; description: string | null };
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const nameId = useId();
  const descriptionId = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: org.name, description: org.description ?? "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: EditFormValues) => {
      // 変更があったフィールドのみを送る。
      // フォームは description が null のときも "" を初期値に持つため、
      // 「name だけ編集して保存」したケースで API に description: "" が
      // 渡って DB の null が空文字で上書きされる事故を防ぐ。
      const json: { name?: string; description?: string } = {};
      if (data.name !== org.name) json.name = data.name;
      const prevDescription = org.description ?? "";
      if (data.description !== prevDescription) {
        json.description = data.description;
      }
      // 変更が無い場合は API を呼ばずに成功扱いで閉じる
      // （API 側の updateSchema が「name か description のどちらか必須」を要求するため、
      // 空ペイロードを送ると 400 になる）。
      if (json.name === undefined && json.description === undefined) {
        return null;
      }
      const res = await api.organizations[":id"].$patch(
        { param: { id: org.id }, json },
        authHeaders(),
      );
      if (!res.ok) {
        throw new Error(`Failed to update organization: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations", org.id] });
      setOpen(false);
    },
  });

  // ダイアログが閉じているときに org が変化したら、最新値に合わせて
  // フォームを同期する。これにより以下のフローで stale な値が残るのを防ぐ:
  //   1. 保存成功 → setOpen(false) → invalidateQueries で refetch がキック
  //   2. 親の useQuery が新しい org を返す
  //   3. この effect が走り、reset({ name: 新しい org.name, ... })
  // ダイアログ表示中は useEffect が reset しないため、入力中の値は破壊されない。
  useEffect(() => {
    if (!open) {
      reset({ name: org.name, description: org.description ?? "" });
    }
  }, [org.name, org.description, open, reset]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">組織情報を編集</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>組織情報を編集</DialogTitle>
          <DialogDescription>組織名と説明を更新します。</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>組織名</Label>
            <Input id={nameId} {...register("name")} />
            {errors.name && (
              <p role="alert" className="text-destructive text-sm">
                {errors.name.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={descriptionId}>説明</Label>
            <Input id={descriptionId} {...register("description")} />
          </div>
          {mutation.isError && (
            <p className="text-destructive text-sm">更新に失敗しました</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ===== 招待ダイアログ =====

const inviteSchema = z.object({
  email: z.string().email("メールアドレスの形式が正しくありません"),
  role: z.enum(["admin", "member"]),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

function InviteMemberDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const emailId = useId();
  const roleId = useId();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "member" },
  });

  const mutation = useMutation({
    mutationFn: async (data: InviteFormValues) => {
      const res = await api.organizations[":id"].invite.$post(
        { param: { id: orgId }, json: data },
        authHeaders(),
      );
      // 4xx/5xx を success として扱うと「招待したつもりが実は失敗」が起きるため弾く。
      if (!res.ok) {
        throw new Error(`Failed to invite member: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["organizations", orgId, "members"],
      });
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
        <Button>メンバーを招待</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>メンバーを招待</DialogTitle>
          <DialogDescription>
            メールアドレスとロールを指定して招待します。招待は 7 日間有効です。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor={emailId}>メールアドレス</Label>
            <Input
              id={emailId}
              type="email"
              placeholder="user@example.com"
              {...register("email")}
            />
            {errors.email && (
              <p role="alert" className="text-destructive text-sm">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={roleId}>ロール</Label>
            <select
              id={roleId}
              {...register("role")}
              className="border rounded-md p-2 bg-background"
            >
              <option value="member">メンバー</option>
              <option value="admin">管理者</option>
            </select>
          </div>
          {mutation.isError && (
            <p className="text-destructive text-sm">招待の送信に失敗しました</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              招待を送信
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{org.name}</h1>
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
          <p className="text-destructive text-sm">
            メンバーの取得に失敗しました
          </p>
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
    </main>
  );
}
