import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";

async function main() {
  const keysDir = join(import.meta.dirname, "..", "keys");

  console.log("Generating RSA key pair...");

  const { privateKey, publicKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
  });

  const privateKeyPem = await exportPKCS8(privateKey);
  const publicKeyPem = await exportSPKI(publicKey);

  writeFileSync(join(keysDir, "private.pem"), privateKeyPem);
  writeFileSync(join(keysDir, "public.pem"), publicKeyPem);

  console.log("Keys generated successfully:");
  console.log(`  - ${join(keysDir, "private.pem")}`);
  console.log(`  - ${join(keysDir, "public.pem")}`);
}

main().catch(console.error);
