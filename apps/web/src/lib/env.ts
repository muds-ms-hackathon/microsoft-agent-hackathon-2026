// Vite の import.meta.env を介した環境変数読み出しの薄いラッパ。
// PROD ビルド時の必須変数の取り漏れを早期検知するため、未設定なら
// throw して fail-fast する。DEV 時は開発の利便性のためフォールバック
// 値を返す。

export function readRequiredViteEnv(
  _key: string,
  _devFallback: string,
  _env: ImportMetaEnv = import.meta.env,
): string {
  throw new Error("not implemented");
}
