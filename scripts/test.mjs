import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repertoire = await mkdtemp(join(process.cwd(), ".tests-"));
try {
  const fichier = join(repertoire, "tests.mjs");
  await build({ entryPoints: ["tests/localisation.test.mjs"], outfile: fichier,
    bundle: true, platform: "node", format: "esm", packages: "external" });
  const resultat = spawnSync(process.execPath, ["--test", fichier], { stdio: "inherit" });
  process.exitCode = resultat.status ?? 1;
} finally {
  await rm(repertoire, { recursive: true, force: true });
}
