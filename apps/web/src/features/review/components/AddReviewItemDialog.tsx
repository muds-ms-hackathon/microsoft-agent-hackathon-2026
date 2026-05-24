// 簡易版: title・type・sourceContext・body のみ対応。
// 担当者・期限・重要度は POST API 非対応のため省略。
// TODO: POST /meetings/:id/review-items は動作確認用エンドポイントのため将来削除予定。
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
import { Textarea } from "@/components/ui/textarea";
import { useOrganizationMeetings } from "@/features/recurring-meetings/hooks/useOrganizationMeetings";
import type { MeetingListItem } from "@/features/recurring-meetings/hooks/useRecurringMeetingMeetings";
import { api, authHeaders } from "@/lib/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TYPE_LABELS, REVIEW_ITEM_TYPES } from "../types";
import { reviewItemsQueryKey } from "../useReviewItems";

const formSchema = z.object({
  recurringMeetingId: z.string().min(1, "定例を選択してください"),
  meetingId: z.string().min(1, "会議を選択してください"),
  type: z.enum(["decision", "open_issue", "task_candidate", "ambiguity"]),
  title: z.string().min(1, "内容は必須です"),
  sourceContext: z.string(),
  body: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_VALUES: FormValues = {
  recurringMeetingId: "",
  meetingId: "",
  type: "task_candidate",
  title: "",
  sourceContext: "",
  body: "",
};

function formatMeetingLabel(meeting: MeetingListItem): string {
  const d = new Date(meeting.heldAt);
  return `${meeting.title} · ${d.getMonth() + 1}/${d.getDate()}`;
}

function MeetingSelect({
  recurringMeetingId,
  value,
  onChange,
  id,
}: {
  recurringMeetingId: string;
  value: string;
  onChange: (meetingId: string) => void;
  id: string;
}) {
  const { data: meetings = [], isLoading } = useQuery<MeetingListItem[]>({
    queryKey: ["recurring-meetings", recurringMeetingId, "meetings"],
    queryFn: async () => {
      const res = await api["recurring-meetings"][":id"].meetings.$get(
        { param: { id: recurringMeetingId } },
        authHeaders(),
      );
      if (!res.ok) throw new Error(`Failed to fetch meetings: ${res.status}`);
      return (await res.json()) as MeetingListItem[];
    },
    enabled: !!recurringMeetingId,
  });

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={isLoading || !recurringMeetingId}
      className="text-sm px-2 py-1.5 rounded-md border border-border/60 bg-card w-full"
    >
      <option value="">会議を選択</option>
      {meetings.map((m) => (
        <option key={m.id} value={m.id}>
          {formatMeetingLabel(m)}
        </option>
      ))}
    </select>
  );
}

export function AddReviewItemDialog({
  orgId,
  initialRmId,
  initialMeetingId,
}: {
  orgId: string;
  initialRmId?: string;
  initialMeetingId?: string;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const rmId = useId();
  const meetingFieldId = useId();
  const typeId = useId();
  const titleId = useId();
  const sourceContextId = useId();
  const bodyId = useId();

  const { data: recurringMeetings = [] } = useOrganizationMeetings(orgId);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ...DEFAULT_VALUES,
      recurringMeetingId: initialRmId ?? "",
      meetingId: initialMeetingId ?? "",
    },
  });

  const selectedRmId = watch("recurringMeetingId");
  const selectedMeetingId = watch("meetingId");
  const selectedType = watch("type");

  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedRmId が変わったときだけリセットする意図的な依存
  useEffect(() => {
    setValue("meetingId", "");
  }, [selectedRmId, setValue]);

  useEffect(() => {
    if (open) {
      reset({
        ...DEFAULT_VALUES,
        recurringMeetingId: initialRmId ?? "",
        meetingId: initialMeetingId ?? "",
      });
    }
  }, [open, initialRmId, initialMeetingId, reset]);

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const body =
        data.type === "ambiguity"
          ? {
              type: data.type as const,
              title: data.title,
              sourceContext: data.sourceContext || undefined,
            }
          : {
              type: data.type as const,
              title: data.title,
              sourceContext: data.sourceContext || undefined,
              body: data.body || undefined,
            };

      const res = await api.meetings[":id"]["review-items"].$post(
        { param: { id: data.meetingId }, json: body },
        authHeaders(),
      );
      if (!res.ok)
        throw new Error(`Failed to create review item: ${res.status}`);
    },
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({
        queryKey: reviewItemsQueryKey({ meetingId: data.meetingId }),
      });
      setOpen(false);
    },
  });

  const onSubmit = (data: FormValues) => mutation.mutate(data);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          サンプルデータを入力
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>サンプルデータを入力</DialogTitle>
          <DialogDescription>
            AIが会議から抽出したていでサンプルデータを登録します。
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={rmId}>定例</Label>
              <select
                id={rmId}
                {...register("recurringMeetingId")}
                className="text-sm px-2 py-1.5 rounded-md border border-border/60 bg-card"
              >
                <option value="">定例を選択</option>
                {recurringMeetings.map((rm) => (
                  <option key={rm.id} value={rm.id}>
                    {rm.name}
                  </option>
                ))}
              </select>
              {errors.recurringMeetingId && (
                <p role="alert" className="text-destructive text-xs">
                  {errors.recurringMeetingId.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={meetingFieldId}>会議</Label>
              <MeetingSelect
                id={meetingFieldId}
                recurringMeetingId={selectedRmId}
                value={selectedMeetingId}
                onChange={(v) =>
                  setValue("meetingId", v, { shouldValidate: true })
                }
              />
              {errors.meetingId && (
                <p role="alert" className="text-destructive text-xs">
                  {errors.meetingId.message}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={typeId}>種別</Label>
            <select
              id={typeId}
              {...register("type")}
              className="text-sm px-2 py-1.5 rounded-md border border-border/60 bg-card"
            >
              {REVIEW_ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={titleId}>内容</Label>
            <Input
              id={titleId}
              placeholder="AIが抽出した決定・課題・タスク等"
              {...register("title")}
            />
            {errors.title && (
              <p role="alert" className="text-destructive text-xs">
                {errors.title.message}
              </p>
            )}
          </div>

          {selectedType !== "ambiguity" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={bodyId}>詳細（任意）</Label>
              <Textarea
                id={bodyId}
                placeholder="補足内容"
                rows={2}
                {...register("body")}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor={sourceContextId}>根拠文脈（任意）</Label>
            <Textarea
              id={sourceContextId}
              placeholder="発話前後の文脈"
              rows={2}
              {...register("sourceContext")}
            />
          </div>

          {mutation.isError && (
            <p className="text-destructive text-xs">登録に失敗しました</p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "登録中..." : "登録"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
