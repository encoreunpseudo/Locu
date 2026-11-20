// Construit l'extension dans dist/ : c'est ce dossier qu'on charge dans chrome://extensions
import { build } from "esbuild";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

// Clé PRIM (calcul d'itinéraires IDFM) lue dans .env, jamais versionnée ; vide si absente.
const env = existsSync(".env") ? Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/)
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
  .map(([, cle, valeur]) => [cle, valeur.replace(/^(["'])(.*)\1$/, "$2")])) : {};
const clePrim = process.env.PRIM_API_KEY ?? env.PRIM_API_KEY ?? "";
if (!clePrim) console.warn("PRIM_API_KEY absente : les temps de trajet seront désactivés.");

rmSync("dist", { recursive: true, force: true });

await build({
  entryPoints: {
    "popup/popup": "popup/popup.ts",
    "content/content": "content/content.ts",
    "options/options": "options/options.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome110",
  define: { __PRIM_API_KEY__: JSON.stringify(clePrim) },
});

for (const f of ["manifest.json", "background.js", "popup/popup.html", "popup/popup.css", "content/content.css", "options/options.html", "data/pictos"]) {
  cpSync(f, `dist/${f}`, { recursive: true });
}

// Le geojson fait 79 Mo à cause des polygones : on ne garde que les champs utiles au calcul
const CHAMPS = ["annee", "nom_quartier", "piece", "epoque", "meuble_txt", "ref", "max", "min", "code_grand_quartier"];
const geojson = JSON.parse(readFileSync("data/logement-encadrement-des-loyers.geojson", "utf8"));
const lignes = geojson.features.map((f) => Object.fromEntries(CHAMPS.map((c) => [c, f.properties[c]])));
mkdirSync("dist/data", { recursive: true });
writeFileSync("dist/data/encadrement.json", JSON.stringify(lignes));

// Les géométries sont répétées pour chaque année et catégorie : une seule par quartier suffit.
const quartiers = new Map();
for (const { properties: p, geometry } of geojson.features) {
  quartiers.set(p.code_grand_quartier, {
    id: p.code_grand_quartier,
    nom: p.nom_quartier,
    arrondissement: Math.floor(p.code_grand_quartier / 100) % 100,
    geometrie: geometry,
  });
}
writeFileSync("dist/data/quartiers.json", JSON.stringify([...quartiers.values()]));

console.log("Extension construite dans dist/");
