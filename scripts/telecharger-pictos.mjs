// Télécharge une fois les pictogrammes de lignes (métro, RER, Transilien, tram) publiés par
// Île-de-France Mobilités, et l'icône de marche (Material Symbols, licence Apache 2.0).
// Les fichiers sont versionnés dans data/pictos/ : le build et l'extension restent hors ligne.
// Usage : node scripts/telecharger-pictos.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const GARES = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/emplacement-des-gares-idf";
const MARCHE = "https://raw.githubusercontent.com/google/material-design-icons/master/symbols/web/directions_walk/materialsymbolsrounded/directions_walk_24px.svg";
const DOSSIER = "data/pictos";

async function telecharger(url) {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`${reponse.status} pour ${url}`);
  return reponse;
}

const lignes = await (await telecharger(`${GARES}/exports/json?select=idrefligc,mode,indice_lig,picto`)).json();
const parLigne = new Map();
for (const { idrefligc, mode, indice_lig, picto } of lignes) {
  if (!idrefligc || !picto?.id || parLigne.has(idrefligc)) continue;
  // Garde-fou : le jeu associe parfois une ligne au picto d'une autre (ex. ligne V → RER_C.svg).
  const attendu = String(indice_lig).toLowerCase();
  const nom = picto.filename.toLowerCase().replace(/\.svg$/, "").split("_").pop().replace(/^t(?=\d)/, "");
  if (nom !== attendu) {
    console.warn(`Ignoré : ${mode} ${indice_lig} (picto ${picto.filename})`);
    parLigne.set(idrefligc, null);
    continue;
  }
  parLigne.set(idrefligc, { mode, ligne: indice_lig, id: picto.id });
}

rmSync(DOSSIER, { recursive: true, force: true });
mkdirSync(DOSSIER, { recursive: true });
const index = {};
for (const [idLigne, picto] of parLigne) {
  if (!picto) continue;
  const { mode, ligne, id } = picto;
  const svg = await (await telecharger(`${GARES}/files/${id}`)).text();
  if (!svg.includes("<svg")) throw new Error(`Picto invalide pour ${mode} ${ligne}`);
  writeFileSync(`${DOSSIER}/${idLigne}.svg`, svg);
  index[idLigne] = { mode, ligne };
}
writeFileSync(`${DOSSIER}/marche.svg`, await (await telecharger(MARCHE)).text());
writeFileSync(`${DOSSIER}/index.json`, JSON.stringify(index, null, 1) + "\n");
console.log(`${Object.keys(index).length} pictogrammes de lignes + marche.svg dans ${DOSSIER}/`);
