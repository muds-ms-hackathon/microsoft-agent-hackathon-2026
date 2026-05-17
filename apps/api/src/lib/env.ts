// 必須 env が本番 (NODE_ENV=production) で未設定なら起動時に throw する fail-fast ヘルパー。
// 開発 / テスト環境では devFallback を返し、ローカル起動の利便性を保つ。
// 本番デプロイで env 漏れがあった場合、誤って fake-auth / ローカル DB に接続したまま
// アプリが起動するのを防ぐ。

export function requireEnv(key: string, devFallback: string): string {
  const value = process.env[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `Required env "${key}" is not set. Set it before starting in production.`,
    );
  }
  return devFallback;
}
