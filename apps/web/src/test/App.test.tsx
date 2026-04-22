import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("App", () => {
  it("描画エラーなくルートページが表示される", async () => {
    render(<App />);
    expect(await screen.findByText("Decision Loop")).toBeInTheDocument();
  });
});
