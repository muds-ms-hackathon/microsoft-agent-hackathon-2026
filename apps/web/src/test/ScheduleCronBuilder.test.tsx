import { ScheduleCronBuilder } from "@/features/recurring-meetings/components/ScheduleCronBuilder";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

// React Hook Form を介さずに使うため、薄いラッパで value/onChange を保持する。
// 実際のフォームでは Controller でバインドする。
function Harness({
  initial,
  onChange,
}: {
  initial: string;
  onChange?: (cron: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ScheduleCronBuilder
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe("ScheduleCronBuilder", () => {
  it("曜日（月）を解除すると cron の曜日リストから外れる", async () => {
    const user = userEvent.setup();
    const handle = vi.fn();
    render(<Harness initial="0 10 * * 1,3" onChange={handle} />);

    // 月を解除すると残りは「水（3）」のみ
    await user.click(screen.getByRole("button", { name: "月" }));
    expect(handle).toHaveBeenLastCalledWith("0 10 * * 3");
  });

  it("毎月モードに切り替えると日選択 UI が現れて cron が monthly 形式になる", async () => {
    const user = userEvent.setup();
    const handle = vi.fn();
    render(<Harness initial="0 10 * * 1" onChange={handle} />);

    await user.click(screen.getByRole("radio", { name: "毎月" }));
    // 日選択 select が出る
    const daySelect = screen.getByLabelText("日");
    expect(daySelect).toBeInTheDocument();
    // 既定の day=1 で cron が組み立てられる
    expect(handle).toHaveBeenLastCalledWith("0 10 1 * *");

    // 日を 15 に変更
    await user.selectOptions(daySelect, "15");
    expect(handle).toHaveBeenLastCalledWith("0 10 15 * *");
  });

  it("時刻入力を変更すると cron の分・時が更新される", () => {
    const handle = vi.fn();
    render(<Harness initial="0 10 * * 1" onChange={handle} />);

    const timeInput = screen.getByLabelText("時刻");
    // time input の userEvent.type は jsdom 上で文字単位の挙動が安定しないため、
    // fireEvent.change で完了状態のみを発火させる。実 UI では time picker から
    // 値を選ぶ操作に相当する。
    fireEvent.change(timeInput, { target: { value: "14:30" } });
    expect(handle).toHaveBeenLastCalledWith("30 14 * * 1");
  });

  it("parseCron で復元できない値が来た場合は既定値（毎週月曜 10:00）にフォールバックする", () => {
    // 範囲指定はビルダー非対応。初回レンダリング時に defaultCronBuilderState が使われ、
    // プレビューが「毎週 月 10:00」になる。onChange は描画時点では呼ばれない（再操作で初めて出る）。
    render(<Harness initial="0 10 * * 1-5" />);
    const preview = screen.getByLabelText("開催頻度プレビュー");
    expect(preview).toHaveTextContent("毎週 月 10:00");
  });

  it("頻度を毎日に切り替えると曜日 UI が消える", async () => {
    const user = userEvent.setup();
    render(<Harness initial="0 10 * * 1" />);

    expect(screen.getByRole("button", { name: "月" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "毎日" }));
    // 曜日ボタン群は消える
    expect(
      screen.queryByRole("button", { name: "月" }),
    ).not.toBeInTheDocument();
  });

  it("エラー文字列を渡すと alert として表示される", () => {
    render(
      <Harness
        initial="0 10 * * 1"
        // onChange は使わない。error を別途差し込むため、Harness ではなく直接利用する。
      />,
    );
    // Harness 経由では error を渡せないため、直接 ScheduleCronBuilder を使ったレンダリングで検証する。
    render(
      <ScheduleCronBuilder
        value="0 10 * * 1"
        onChange={() => {}}
        error="開催頻度が不正です"
      />,
    );
    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((el) => el.textContent === "開催頻度が不正です")).toBe(
      true,
    );
  });
});
