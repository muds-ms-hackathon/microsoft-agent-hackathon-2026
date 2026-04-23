import { api } from "@/lib/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";

export const Route = createFileRoute("/")({
  component: Index,
});

// ===== 型定義 =====

type Meeting = {
  id: string;
  title: string;
  heldAt: string;
  createdAt: string;
};

// ===== meetings 一覧 =====

function MeetingsList() {
  const { data: meetings = [], isLoading } = useQuery<Meeting[]>({
    queryKey: ["meetings"],
    queryFn: async () => {
      const res = await api.meetings.$get();
      return res.json();
    },
  });

  if (isLoading) return <p>読み込み中...</p>;

  return (
    <section>
      <h2 className="text-xl font-semibold mb-2">会議一覧</h2>
      <ul className="space-y-1">
        {meetings.map((m) => (
          <li key={m.id} className="border rounded p-2">
            <span className="font-medium">{m.title}</span>
            <span className="ml-2 text-sm text-muted-foreground">
              {new Date(m.heldAt).toLocaleString("ja-JP")}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ===== 作成フォーム =====

const createSchema = z.object({
  title: z.string().min(1, "タイトルは必須です"),
  heldAt: z.string().min(1, "開催日時は必須です"),
});

type CreateFormValues = z.infer<typeof createSchema>;

function CreateMeetingForm() {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFormValues>({ resolver: zodResolver(createSchema) });

  const mutation = useMutation({
    mutationFn: async (data: CreateFormValues) => {
      const res = await api.meetings.$post({
        json: {
          title: data.title,
          // datetime-local 値を ISO 8601 UTC に変換
          heldAt: new Date(data.heldAt).toISOString(),
        },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      reset();
    },
  });

  return (
    <section>
      <h2 className="text-xl font-semibold mb-2">会議を作成</h2>
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="flex flex-col gap-2 max-w-sm"
      >
        <input
          {...register("title")}
          placeholder="タイトル"
          className="border rounded px-2 py-1"
        />
        {errors.title && (
          <p role="alert" className="text-red-500 text-sm">
            {errors.title.message}
          </p>
        )}
        <input
          {...register("heldAt")}
          id="heldAt"
          aria-label="開催日時"
          type="datetime-local"
          className="border rounded px-2 py-1"
        />
        {errors.heldAt && (
          <p role="alert" className="text-red-500 text-sm">
            {errors.heldAt.message}
          </p>
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="bg-primary text-primary-foreground rounded px-4 py-1"
        >
          作成
        </button>
        {mutation.isError && (
          <p className="text-red-500 text-sm">作成に失敗しました</p>
        )}
      </form>
    </section>
  );
}

// ===== メインページ =====

export function Index() {
  return (
    <main className="container mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">Decision Loop</h1>
      <MeetingsList />
      <CreateMeetingForm />
    </main>
  );
}
