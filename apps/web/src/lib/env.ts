// Vite の import.meta.env を介した環境変数読み出しの薄いラッパ。
// PROD ビルド時の必須変数の取り漏れを早期検知するため、未設定なら
// throw して fail-fast する。DEV 時は開発の利便性のためフォールバック
// 値を返す。

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
