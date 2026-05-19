import { AvatarStack } from "@/features/tasks/components/AvatarStack";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("AvatarStack", () => {
  it("0 件は「担当者未指定」と表示", () => {
    render(<AvatarStack users={[]} />);
    expect(screen.getByText("担当者未指定")).toBeInTheDocument();
  });

  it("displayName の先頭イニシャルを表示する", () => {
    render(
      <AvatarStack
        users={[
          { id: "u1", displayName: "Alice" },
          { id: "u2", displayName: "Bob" },
        ]}
      />,
    );
    const stack = screen.getByTestId("task-assignee-avatars");
    expect(stack).toHaveTextContent("A");
    expect(stack).toHaveTextContent("B");
  });

  it("max を超えると +N で省略する", () => {
    render(
      <AvatarStack
        max={2}
        users={[
          { id: "u1", displayName: "Alice" },
          { id: "u2", displayName: "Bob" },
          { id: "u3", displayName: "Charlie" },
          { id: "u4", displayName: "Dave" },
        ]}
      />,
    );
    const stack = screen.getByTestId("task-assignee-avatars");
    expect(stack).toHaveTextContent("A");
    expect(stack).toHaveTextContent("B");
    expect(stack).not.toHaveTextContent("C");
    expect(stack).toHaveTextContent("+2");
  });

  it("aria-label に担当者全員の displayName が含まれる", () => {
    render(
      <AvatarStack
        users={[
          { id: "u1", displayName: "Alice" },
          { id: "u2", displayName: "Bob" },
        ]}
      />,
    );
    const stack = screen.getByLabelText(/担当者: Alice, Bob/);
    expect(stack).toBeInTheDocument();
  });

  it("同じ userId は再 render で同じ色になる（背景クラスが一致）", () => {
    const { rerender } = render(
      <AvatarStack users={[{ id: "u1", displayName: "Alice" }]} />,
    );
    const stack1 = screen.getByTestId("task-assignee-avatars");
    const firstClass = (stack1.firstChild as HTMLElement | null)?.className;

    rerender(<AvatarStack users={[{ id: "u1", displayName: "Alice" }]} />);
    const stack2 = screen.getByTestId("task-assignee-avatars");
    const secondClass = (stack2.firstChild as HTMLElement | null)?.className;

    expect(firstClass).toBe(secondClass);
  });

  it("displayName が空文字でも '?' で fallback する", () => {
    render(<AvatarStack users={[{ id: "u1", displayName: "" }]} />);
    expect(screen.getByTestId("task-assignee-avatars")).toHaveTextContent("?");
  });
});
