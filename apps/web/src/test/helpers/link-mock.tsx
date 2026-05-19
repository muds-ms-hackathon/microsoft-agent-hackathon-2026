import type { ReactNode } from "react";
import { vi } from "vitest";

// TanStack Router の <Link> は RouterProvider が無いと内部で落ちるため、
// テスト中は href を持つ通常の <a> として描画するモックに差し替える。
// 子要素・className を保持し、属性ベースの assertion を可能にする。
// `to` 内の `$key` は `params[key]` で置換する（未指定なら空文字）。
export function MockLink({
  to,
  params,
  children,
  className,
}: {
  to: string;
  params?: Record<string, string>;
  children?: ReactNode;
  className?: string;
}) {
  const href =
    typeof to === "string"
      ? to.replace(/\$(\w+)/g, (_, k: string) => params?.[k] ?? "")
      : String(to);
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    Link: MockLink,
  };
});
