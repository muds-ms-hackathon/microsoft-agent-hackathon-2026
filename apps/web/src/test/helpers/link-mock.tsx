import { vi } from "vitest";
import { buildRouterMock, MockLink } from "./router-mock";

// import するだけで Link モックが適用される薄いアダプタ。
// 他の TanStack Router API を併用しないテスト向けの簡易版。
// 複数 API を差し替える場合は `buildRouterMock` を直接 vi.mock factory に渡す。
export { MockLink };

vi.mock("@tanstack/react-router", () => buildRouterMock());
