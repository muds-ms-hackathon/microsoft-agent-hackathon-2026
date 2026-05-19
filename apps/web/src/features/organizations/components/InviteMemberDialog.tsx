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
import { useInviteMember } from "@/features/organizations/hooks/useInviteMember";
import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email("メールアドレスの形式が正しくありません"),
  role: z.enum(["admin", "member"]),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

// メンバー招待ダイアログ。
// 招待成功後はフォームを reset してダイアログを閉じる。
export function InviteMemberDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
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

  const mutation = useInviteMember(orgId, () => {
    reset();
    setOpen(false);
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
