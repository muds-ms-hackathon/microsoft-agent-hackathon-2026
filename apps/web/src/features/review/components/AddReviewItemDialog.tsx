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
import { AssigneePicker } from "@/features/tasks/components/AssigneePicker";
import { api, authHeaders } from "@/lib/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import type { ReviewItem } from "../types";
import { REVIEW_ITEM_TYPES, TYPE_LABELS } from "../types";

const formSchema = z.object({
  recurringMeetingId: z.string().min(1, "定例を選択してください"),
  meetingId: z.string().min(1, "会議を選択してください"),
  type: z.enum(["decision", "open_issue", "task_candidate", "ambiguity"]),
  content: z.string().min(1, "内容は必須です"),
  sourceQuote: z.string(),
  sourceContext: z.string(),
  assigneeIds: z.array(z.string()),
  deadline: z.string(),
  severity: z.enum(["high", "medium", "low"]).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULT_VALUES: FormValues = {
  recurringMeetingId: "",
  meetingId: "",
  type: "task_candidate",
  content: "",
  sourceQuote: "",
  sourceContext: "",
  assigneeIds: [],
  deadline: "",
  severity: undefined,
};

function formatMeetingLabel(meeting: MeetingListItem): string {
  const d = new Date(meeting.heldAt);
  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
  return `${meeting.title} · ${dateStr}`;
}

// 定例を選んだ後に会議一覧を取得するインナーコンポーネント
function MeetingSelect({
  recurringMeetingId,
  value,
  onChange,
  id,
}: {
  recurringMeetingId: string;
  value: string;
  onChange: (meetingId: string, label: string) => void;
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
      onChange={(e) => {
        const m = meetings.find((m) => m.id === e.target.value);
        onChange(e.target.value, m ? formatMeetingLabel(m) : "");
      }}
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
  onAdd,
  initialRmId,
  initialMeetingId,
}: {
  orgId: string;
  onAdd: (draft: Omit<ReviewItem, "id" | "status">) => void;
  initialRmId?: string;
  initialMeetingId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [meetingLabel, setMeetingLabel] = useState("");

  const rmId = useId();
  const meetingId = useId();
  const typeId = useId();
  const contentId = useId();
  const sourceQuoteId = useId();
  const sourceContextId = useId();
  const deadlineId = useId();
  const severityId = useId();

  const { data: recurringMeetings = [] } = useOrganizationMeetings(orgId);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
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

  // 定例を切り替えたら会議の選択をリセット
  // biome-ignore lint/correctness/useExhaustiveDependencies: selectedRmId が変わったときだけリセットする意図的な依存
  useEffect(() => {
    setValue("meetingId", "");
  }, [selectedRmId, setValue]);

  // ダイアログを開くたびに initialRmId を反映
  useEffect(() => {
    if (open) {
      reset({
        ...DEFAULT_VALUES,
        recurringMeetingId: initialRmId ?? "",
        meetingId: initialMeetingId ?? "",
      });
      setMeetingLabel("");
    }
  }, [open, initialRmId, initialMeetingId, reset]);

  const selectedType = watch("type");

  const onSubmit = (data: FormValues) => {
    const rm = recurringMeetings.find((r) => r.id === data.recurringMeetingId);
    if (!rm) return;

    onAdd({
      type: data.type,
      content: data.content,
      sourceQuote: data.sourceQuote || null,
      sourceContext: data.sourceContext,
      assigneeIds: data.assigneeIds,
      deadline: data.deadline || null,
      aiProposedDeadline: data.deadline || null,
      severity: data.type === "ambiguity" ? (data.severity ?? "medium") : null,
      recurringMeetingId: data.recurringMeetingId,
      recurringMeetingName: rm.name,
      meetingId: data.meetingId,
      meetingLabel: meetingLabel,
    });
    setOpen(false);
  };

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
              <Label htmlFor={meetingId}>会議</Label>
              <MeetingSelect
                id={meetingId}
                recurringMeetingId={selectedRmId}
                value={selectedMeetingId}
                onChange={(v, label) => {
                  setValue("meetingId", v, { shouldValidate: true });
                  setMeetingLabel(label);
                }}
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
            <Label htmlFor={contentId}>内容</Label>
            <Input
              id={contentId}
              placeholder="AIが抽出した決定・課題・タスク等"
              {...register("content")}
            />
            {errors.content && (
              <p role="alert" className="text-destructive text-xs">
                {errors.content.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={sourceQuoteId}>根拠発話（1文）</Label>
            <Input
              id={sourceQuoteId}
              placeholder="「AIが根拠とした発話を1文で」"
              {...register("sourceQuote")}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={sourceContextId}>根拠文脈（前後の文脈）</Label>
            <Textarea
              id={sourceContextId}
              placeholder="発話前後の文脈"
              rows={2}
              {...register("sourceContext")}
            />
          </div>

          {selectedType === "ambiguity" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={severityId}>重要度</Label>
              <select
                id={severityId}
                {...register("severity")}
                className="text-sm px-2 py-1.5 rounded-md border border-border/60 bg-card"
              >
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>担当者</Label>
            <Controller
              name="assigneeIds"
              control={control}
              render={({ field }) => (
                <AssigneePicker
                  organizationId={orgId}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={deadlineId}>期限</Label>
            <Input id={deadlineId} type="date" {...register("deadline")} />
          </div>

          <DialogFooter>
            <Button type="submit">登録</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
