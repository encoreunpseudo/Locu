import { build } from "esbuild";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repertoire = await mkdtemp(join(process.cwd(), ".tests-"));
try {
  const entrees = (await readdir("tests")).filter((f) => f.endsWith(".test.mjs")).map((f) => join("tests", f));
  await build({ entryPoints: entrees, outdir: repertoire,
    bundle: true, platform: "node", format: "esm", packages: "external" });
  const fichiers = (await readdir(repertoire)).map((f) => join(repertoire, f));
  const resultat = spawnSync(process.execPath, ["--test", ...fichiers], { stdio: "inherit" });
  process.exitCode = resultat.status ?? 1;
} finally {
  await rm(repertoire, { recursive: true, force: true });
}
