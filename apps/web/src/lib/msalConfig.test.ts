import { beforeEach, describe, expect, it, vi } from "vitest";

// PublicClientApplication のコンストラクタに渡された config をキャプチャするため
// @azure/msal-browser をモックする。
// vi.mock は巻き上げられるため、capturedConfig への参照は宣言だけしておく。
type CapturedConfig = {
  auth?: Record<string, unknown>;
  cache?: Record<string, unknown>;
};
const capturedConfig: CapturedConfig[] = [];

vi.mock("@azure/msal-browser", () => ({
  PublicClientApplication: vi.fn().mockImplementation((config: CapturedConfig) => {
    capturedConfig.push(config);
    return {};
  }),
}));

describe("getMsalInstance (MSAL 設定)", () => {
  beforeEach(async () => {
    // モジュールレベル定数を新しい env 値で再評価させるため、毎テストでリセットする
    vi.resetModules();
    capturedConfig.length = 0;

    // import.meta.env に Entra 設定を注入する（テスト環境では mutable）
    import.meta.env.VITE_ENTRA_CLIENT_ID = "test-client-id";
    import.meta.env.VITE_ENTRA_AUTHORITY =
      "https://test-tenant.ciamlogin.com/test-tenant-id";
    import.meta.env.VITE_ENTRA_REDIRECT_URI = "http://localhost:5173/login";
  });

  it("複数回呼び出しても同一インスタンスを返す（シングルトン）", async () => {
    const { getMsalInstance } = await import("@/lib/msalConfig");
    const a = getMsalInstance();
    const b = getMsalInstance();
    expect(a).toBe(b);
  });

  it("knownAuthorities に authority URL のホスト名が設定される", async () => {
    const { getMsalInstance } = await import("@/lib/msalConfig");
    getMsalInstance();

    expect(capturedConfig[0]?.auth?.knownAuthorities).toEqual([
      "test-tenant.ciamlogin.com",
    ]);
  });

  it("navigateToLoginRequestUrl が false に設定される", async () => {
    const { getMsalInstance } = await import("@/lib/msalConfig");
    getMsalInstance();

    expect(capturedConfig[0]?.auth?.navigateToLoginRequestUrl).toBe(false);
  });

  it("cacheLocation が sessionStorage に設定される", async () => {
    const { getMsalInstance } = await import("@/lib/msalConfig");
    getMsalInstance();

    expect(capturedConfig[0]?.cache?.cacheLocation).toBe("sessionStorage");
  });

  it("authority 末尾スラッシュは除去される", async () => {
    import.meta.env.VITE_ENTRA_AUTHORITY =
      "https://test-tenant.ciamlogin.com/test-tenant-id/";
    const { getMsalInstance } = await import("@/lib/msalConfig");
    getMsalInstance();

    expect(capturedConfig[0]?.auth?.authority).toBe(
      "https://test-tenant.ciamlogin.com/test-tenant-id",
    );
  });


});
