import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

// monorepo ルートの docker-compose.yml と .env.docker を解析する。
// この test は make dev（フル Docker 起動）時に api コンテナが
// fake-auth の JWKS を取得でき、token の iss と issuer 検証が一致する
// 構成になっていることを保証するためのもの。
// OIDC_ISSUER_URL は environment ではなく .env.docker（env_file）で管理する。
type ComposeService = {
  environment?: Record<string, string | number | boolean>;
};
type Compose = {
  services: Record<string, ComposeService>;
};

const root = resolve(import.meta.dirname, "../../..");
const composePath = resolve(root, "docker-compose.yml");
const compose = YAML.parse(readFileSync(composePath, "utf-8")) as Compose;

// .env.docker から KEY=VALUE 形式で読み取る
function parseEnvFile(path: string): Record<string, string> {
  const content = readFileSync(path, "utf-8");
  return Object.fromEntries(
    content
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"))
      .map((line) => line.split("=", 2) as [string, string]),
  );
}
const envDocker = parseEnvFile(resolve(root, ".env.docker"));

describe("docker-compose.yml OIDC env consistency", () => {
  it("api サービスの OIDC_ISSUER_URL が .env.docker に文字列で設定されている", () => {
    const url = envDocker.OIDC_ISSUER_URL;
    expect(typeof url).toBe("string");
    expect(url).toBeTruthy();
  });

  it("fake-auth の ISSUER と .env.docker の OIDC_ISSUER_URL が一致する", () => {
    // api 側の jwtVerify は token の iss クレームと issuer オプションが
    // 完全一致しないと検証失敗するため、両者は同一値である必要がある。
    const apiIssuer = envDocker.OIDC_ISSUER_URL;
    const fakeAuthIssuer = compose.services["fake-auth"]?.environment?.ISSUER;
    expect(apiIssuer).toBe(fakeAuthIssuer);
  });

  it("issuer の hostname は Docker service 名で localhost ではない", () => {
    // localhost のままだと api コンテナ内で自分自身を指してしまい、
    // /.well-known/jwks.json の取得に失敗する。
    const url = envDocker.OIDC_ISSUER_URL;
    const hostname = new URL(url).hostname;
    expect(hostname).not.toBe("localhost");
    expect(hostname).toBe("fake-auth");
  });
});
