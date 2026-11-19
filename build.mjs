// Construit l'extension dans dist/ : c'est ce dossier qu'on charge dans chrome://extensions
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });

await build({
  entryPoints: { "popup/popup": "popup/popup.ts", "content/content": "content/content.ts" },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome110",
});

for (const f of ["manifest.json", "background.js", "popup/popup.html", "popup/popup.css", "content/content.css", "options"]) {
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
cpSync("data/localisation-lieux.json", "dist/data/localisation-lieux.json");

console.log("Extension construite dans dist/");
