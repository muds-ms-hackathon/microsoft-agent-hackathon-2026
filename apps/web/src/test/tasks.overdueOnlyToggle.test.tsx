import { OverdueOnlyToggle } from "@/features/tasks/components/OverdueOnlyToggle";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// 単一のトグルボタン。視覚的には status filter チップと同じスタイルで揃え、
// aria-pressed で押下状態を表現する想定。

describe("OverdueOnlyToggle", () => {
  it("ラベル「期限超過のみ」のボタンとして描画される", () => {
    render(<OverdueOnlyToggle value={false} onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: "期限超過のみ" }),
    ).toBeInTheDocument();
  });

  it("value=false のとき aria-pressed=false", () => {
    render(<OverdueOnlyToggle value={false} onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: "期限超過のみ" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("value=true のとき aria-pressed=true", () => {
    render(<OverdueOnlyToggle value={true} onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: "期限超過のみ" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("OFF からクリックすると onChange(true) を呼ぶ", async () => {
    const onChange = vi.fn();
    render(<OverdueOnlyToggle value={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "期限超過のみ" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("ON からクリックすると onChange(false) を呼ぶ", async () => {
    const onChange = vi.fn();
    render(<OverdueOnlyToggle value={true} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "期限超過のみ" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
