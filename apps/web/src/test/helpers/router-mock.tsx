import type { ReactNode } from "react";
import { vi } from "vitest";

// TanStack Router の <Link> は RouterProvider が無いとレンダーに失敗するため、
// href を持つ通常の <a> として描画するモックを共通提供する。
// `to` 内の `$key` は `params[key]` で置換する（未指定なら空文字）。
export function MockLink({
  to,
  params,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  to: string;
  params?: Record<string, string>;
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const href =
    typeof to === "string"
      ? to.replace(/\$(\w+)/g, (_, k: string) => params?.[k] ?? "")
      : String(to);
  return (
    <a href={href} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  );
}

export type RouterMockOverrides<TState = unknown> = {
  /** useNavigate() の戻り値として返す関数。指定時のみ useNavigate を差し替える。*/
  useNavigate?: (...args: never[]) => unknown;
  /** useRouterState の state を生成する関数。selector があれば適用する。*/
  routerState?: () => TState;
  /** createFileRoute を `() => () => ({})` の no-op に置き換える。*/
  mockFileRoute?: boolean;
};

type ActualRouter = typeof import("@tanstack/react-router");

// vi.mock の戻り値として渡せる、差し替え可能な API を持つ Router モック型。
// actual の型を保ちつつ、override 対象の関数はテスト用シグネチャに緩める。
export type RouterMock<TState = unknown> = ActualRouter & {
  Link: typeof MockLink;
  useNavigate: () => unknown;
  useRouterState: (opts?: { select?: (s: TState) => unknown }) => unknown;
  createFileRoute: (path: string) => (options: unknown) => unknown;
};

// `vi.mock("@tanstack/react-router", () => buildRouterMock({ ... }))` の factory として使う。
// 必要な API のみ差し替え、それ以外は actual を継承する。
export async function buildRouterMock<TState = unknown>(
  overrides: RouterMockOverrides<TState> = {},
): Promise<RouterMock<TState>> {
  const actual = await vi.importActual<ActualRouter>("@tanstack/react-router");
  const mock: Record<string, unknown> = {
    ...actual,
    Link: MockLink,
  };
  if (overrides.useNavigate) {
    const navigate = overrides.useNavigate;
    mock.useNavigate = () => navigate;
  }
  if (overrides.routerState) {
    const state = overrides.routerState;
    mock.useRouterState = ({
      select,
    }: {
      select?: (s: TState) => unknown;
    } = {}) => {
      const value = state();
      return select ? select(value) : value;
    };
  }
  if (overrides.mockFileRoute) {
    mock.createFileRoute = () => () => ({});
  }
  return mock as unknown as RouterMock<TState>;
}
