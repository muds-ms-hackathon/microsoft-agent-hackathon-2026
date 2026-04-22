import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("App", () => {
  it("描画エラーなくレンダリングされる", () => {
    render(<App />);
    expect(screen.getByText("Decision Loop")).toBeInTheDocument();
  });
});
