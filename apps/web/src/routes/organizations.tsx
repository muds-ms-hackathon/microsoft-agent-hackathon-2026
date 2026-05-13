import { Outlet, createFileRoute } from "@tanstack/react-router";

// /organizations 配下のレイアウトルート。
// `organizations.index.tsx` (一覧) と `organizations.$id.tsx` (詳細) を
// 子ルートとして包含し、Outlet で振り分ける。
export const Route = createFileRoute("/organizations")({
  component: () => <Outlet />,
});
