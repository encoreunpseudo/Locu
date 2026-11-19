import { readFile, writeFile, rename } from "node:fs/promises";
import { parseArgs } from "node:util";

import { convertirGeoJson } from "./convertir-geojson.mjs";

async function importer() {
  const { values } = parseArgs({ options: {
    rues: { type: "string" }, stations: { type: "string" }, sources: { type: "string" },
    "nom-rues": { type: "string" }, "nom-stations": { type: "string" },
    sortie: { type: "string", default: "data/localisation-lieux.json" },
  } });
  if (!values.rues || !values.stations || !values.sources) {
    throw new Error("Usage : npm run import:localisation -- --rues voies.geojson --stations stations.geojson --sources sources.json");
  }
  const lire = async (chemin) => JSON.parse(await readFile(chemin, "utf8"));
  const [rues, stations, sources] = await Promise.all([lire(values.rues), lire(values.stations), lire(values.sources)]);
  if (!Array.isArray(sources) || sources.length < 2 || sources.some((s) =>
    [s.nom, s.url, s.licence, s.dateImport].some((v) => typeof v !== "string" || !v.trim()))) {
    throw new Error("Sources attendues : au moins deux entrées { nom, url, licence, dateImport }");
  }
  const resultat = {
    sources,
    rues: convertirGeoJson(rues, "rues", values["nom-rues"]),
    stations: convertirGeoJson(stations, "stations", values["nom-stations"]),
  };
  // Ne pas remplacer le référentiel existant si la validation ou l'écriture échoue.
  const temporaire = `${values.sortie}.tmp`;
  await writeFile(temporaire, JSON.stringify(resultat));
  await rename(temporaire, values.sortie);
  console.log(`${resultat.rues.length} rues et ${resultat.stations.length} stations importées dans ${values.sortie}`);
}

importer().catch((erreur) => { console.error(erreur.message); process.exitCode = 1; });
