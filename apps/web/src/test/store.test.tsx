import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { atom, useAtom } from "jotai";
import { Provider } from "jotai";
import { describe, expect, it } from "vitest";

const countAtom = atom(0);

function Counter() {
  const [count, setCount] = useAtom(countAtom);
  return (
    <div>
      <span>カウント: {count}</span>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        増加
      </button>
    </div>
  );
}

// Provider でラップしてテストごとに独立したストアを使用し、atom の状態漏洩を防ぐ
function renderWithStore(ui: React.ReactElement) {
  return render(<Provider>{ui}</Provider>);
}

describe("Jotai v2", () => {
  it("atom の初期値が表示される", () => {
    renderWithStore(<Counter />);
    expect(screen.getByText("カウント: 0")).toBeInTheDocument();
  });

  it("ボタンクリックで atom の値が更新される", async () => {
    const user = userEvent.setup();
    renderWithStore(<Counter />);
    await user.click(screen.getByRole("button", { name: "増加" }));
    expect(screen.getByText("カウント: 1")).toBeInTheDocument();
  });
});
