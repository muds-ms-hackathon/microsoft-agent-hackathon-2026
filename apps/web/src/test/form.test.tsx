import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1, "名前は必須です"),
  email: z.string().email("有効なメールアドレスを入力してください"),
});

type FormValues = z.infer<typeof schema>;

function TestForm({ onSubmit }: { onSubmit: (data: FormValues) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("name")} placeholder="名前" />
      {errors.name && <p role="alert">{errors.name.message}</p>}
      <input {...register("email")} placeholder="メールアドレス" />
      {errors.email && <p role="alert">{errors.email.message}</p>}
      <button type="submit">送信</button>
    </form>
  );
}

describe("React Hook Form + Zod", () => {
  it("バリデーションエラーなしでフォームが送信される", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);

    await user.type(screen.getByPlaceholderText("名前"), "田中太郎");
    await user.type(
      screen.getByPlaceholderText("メールアドレス"),
      "test@example.com",
    );
    await user.click(screen.getByRole("button", { name: "送信" }));

    // handleSubmit は第2引数に event を渡すため objectContaining で検証
    expect(onSubmit).toHaveBeenCalledWith(
      { name: "田中太郎", email: "test@example.com" },
      expect.anything(),
    );
  });

  it("空のフォーム送信時にバリデーションエラーが表示される", async () => {
    const user = userEvent.setup();
    render(<TestForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "送信" }));

    expect(await screen.findByText("名前は必須です")).toBeInTheDocument();
  });

  it("無効なメールアドレスでエラーが表示される", async () => {
    const user = userEvent.setup();
    render(<TestForm onSubmit={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("名前"), "田中太郎");
    await user.type(
      screen.getByPlaceholderText("メールアドレス"),
      "invalid-email",
    );
    await user.click(screen.getByRole("button", { name: "送信" }));

    expect(
      await screen.findByText("有効なメールアドレスを入力してください"),
    ).toBeInTheDocument();
  });
});
