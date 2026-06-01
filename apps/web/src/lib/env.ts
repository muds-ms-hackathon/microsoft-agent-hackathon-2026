// Vite の import.meta.env を介した環境変数読み出しの薄いラッパ。
// PROD ビルド時の必須変数の取り漏れを早期検知するため、未設定なら
// throw して fail-fast する。DEV 時は開発の利便性のためフォールバック値を返す。
export function readRequiredViteEnv(
  key: string,
  devFallback: string,
  env: ImportMetaEnv = import.meta.env,
): string {
  const value = env[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (env.PROD) {
    throw new Error(
      `Required Vite env "${key}" is not set. Set it before building for production.`,
    );
  }
  return devFallback;
}

// API の base URL を解決する。未設定・空文字・空白のみの場合は "/api" を返す。
// "/api" はローカル開発時の Vite dev server proxy がそのまま使用できるフォールバック値。
export function resolveApiBaseUrl(url?: string): string {
  return (url?.trim() || "/api").replace(/\/+$/, "");
}
