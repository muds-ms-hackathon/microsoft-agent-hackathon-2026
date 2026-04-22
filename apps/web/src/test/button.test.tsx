import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../components/ui/button";

describe("Button (shadcn/ui)", () => {
  it("テキストを持つボタンが描画される", () => {
    render(<Button>クリック</Button>);
    expect(
      screen.getByRole("button", { name: "クリック" }),
    ).toBeInTheDocument();
  });

  it("variant='outline' でボタンが描画される", () => {
    render(<Button variant="outline">アウトライン</Button>);
    expect(
      screen.getByRole("button", { name: "アウトライン" }),
    ).toBeInTheDocument();
  });
});
