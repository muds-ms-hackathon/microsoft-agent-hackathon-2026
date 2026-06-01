import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// フックをモックして、ダイアログの描画と送信配線のみを検証する。
const mutateMock = vi.fn();
const useMeMock = vi.fn();
const useUpdateDisplayNameMock = vi.fn();

vi.mock("../hooks/useMe", () => ({
  useMe: () => useMeMock(),
}));
vi.mock("../hooks/useUpdateDisplayName", () => ({
  useUpdateDisplayName: () => useUpdateDisplayNameMock(),
}));

import { SettingsDialog } from "./SettingsDialog";

describe("SettingsDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMeMock.mockReturnValue({
      data: {
        id: "user-1",
        email: "me@example.com",
        name: "Me User",
        displayName: "現在の名前",
      },
      isLoading: false,
    });
    useUpdateDisplayNameMock.mockReturnValue({
      mutate: mutateMock,
      isPending: false,
      isError: false,
    });
  });

  it("開いている時に現在の表示名を入力欄に表示する", () => {
    render(<SettingsDialog open={true} onOpenChange={() => {}} />);
    const input = screen.getByLabelText("表示名") as HTMLInputElement;
    expect(input.value).toBe("現在の名前");
  });

  it("表示名を編集して保存するとミューテーションを呼ぶ", async () => {
    const user = userEvent.setup();
    render(<SettingsDialog open={true} onOpenChange={() => {}} />);
    const input = screen.getByLabelText("表示名");
    await user.clear(input);
    await user.type(input, "新しい名前");
    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(mutateMock).toHaveBeenCalledWith("新しい名前", expect.anything()),
    );
  });

  it("表示名が空の場合はバリデーションエラーを表示し保存しない", async () => {
    const user = userEvent.setup();
    render(<SettingsDialog open={true} onOpenChange={() => {}} />);
    const input = screen.getByLabelText("表示名");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
