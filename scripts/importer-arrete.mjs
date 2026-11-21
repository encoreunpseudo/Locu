// Importe la grille d'un arrêté préfectoral d'encadrement des loyers (PDF) quand la Ville de Paris
// ne l'a pas publiée dans son geojson open data (cas de l'arrêté du 12 juin 2026).
// L'arrêté donne les loyers par secteur géographique (annexe 2) et le secteur de chaque quartier
// (annexe 1) : on reconstitue les lignes du geojson, quartier par quartier, dans
// data/encadrement-<annee>.json, que build.mjs ajoute au barème.
// Usage : node scripts/importer-arrete.mjs <annee> <url ou chemin du PDF>
// Nécessite pdftotext (poppler : brew install poppler).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [annee, source] = process.argv.slice(2);
if (!/^20\d{2}$/.test(annee ?? "") || !source) {
  console.error("Usage : node scripts/importer-arrete.mjs <annee> <url ou chemin du PDF>");
  process.exit(1);
}

const dossier = mkdtempSync(join(tmpdir(), "arrete-"));
let texte;
try {
  let pdf = source;
  if (/^https?:\/\//.test(source)) {
    const reponse = await fetch(source);
    if (!reponse.ok) throw new Error(`${reponse.status} pour ${source}`);
    pdf = join(dossier, "arrete.pdf");
    writeFileSync(pdf, Buffer.from(await reponse.arrayBuffer()));
  }
  const resultat = spawnSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (resultat.error || resultat.status !== 0) throw new Error(`pdftotext a échoué : ${resultat.error?.message ?? resultat.stderr}`);
  texte = resultat.stdout;
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

const nombre = (s) => Number(s.replace(",", "."));
const debutAnnexe = (n) => {
  const i = texte.search(new RegExp(`ANNEXE ${n} :`));
  if (i < 0) throw new Error(`Annexe ${n} introuvable`);
  return i;
};
const annexe1 = texte.slice(debutAnnexe(1), debutAnnexe(2));
const annexe2 = texte.slice(debutAnnexe(2), debutAnnexe(3));

// Annexe 1 : « 36   Rochechouart   IX ème   5 »
const secteurs = new Map();
for (const m of annexe1.matchAll(/^\s*(\d{1,2})\s{2,}(.+?)\s{2,}[IVXL]+\s*(?:er|ème)\s{2,}(\d{1,2})\s*$/gm)) {
  secteurs.set(Number(m[1]), Number(m[3]));
}
if (secteurs.size !== 80) throw new Error(`Annexe 1 : ${secteurs.size} quartiers lus au lieu de 80`);

// Annexe 2 : une ligne par époque, dans l'ordre secteur → pièces → époque ; secteur et pièces
// sont écrits seuls sur une ligne au milieu de leur bloc, on les vérifie mais on suit l'ordre.
const EPOQUES = { "< 1946": "Avant 1946", "1946-1970": "1946-1970", "1971-1990": "1971-1990", "> 1990": "Apres 1990" };
const valeur = String.raw`(\d+,\d)`;
const ligneGrille = new RegExp(String.raw`^\s*(< 1946|1946-1970|1971-1990|> 1990)` + String.raw`\s+${valeur}`.repeat(7) + String.raw`\s*$`, "gm");
const grille = [...annexe2.matchAll(ligneGrille)];
const nbSecteurs = Math.max(...secteurs.values());
if (grille.length !== nbSecteurs * 16) throw new Error(`Annexe 2 : ${grille.length} lignes lues au lieu de ${nbSecteurs * 16}`);
const etiquettes = [...annexe2.matchAll(/^\s*(\d{1,2}|4 et \+)\s*$/gm)].map((m) => m[1]);
const attendues = Array.from({ length: nbSecteurs }, (_, s) => ["1", "2", String(s + 1), "3", "4 et +"]).flat();
if (etiquettes.join("|") !== attendues.join("|")) throw new Error("Annexe 2 : secteurs ou nombres de pièces dans un ordre inattendu");

const parSecteur = new Map();
grille.forEach((m, i) => {
  const secteur = Math.floor(i / 16) + 1;
  const piece = Math.floor((i % 16) / 4) + 1;
  const epoque = EPOQUES[m[1]];
  if (epoque !== Object.values(EPOQUES)[i % 4]) throw new Error(`Annexe 2 : époque inattendue ligne ${i + 1}`);
  const [min, ref, max, majoration, minMeuble, refMeuble, maxMeuble] = m.slice(2).map(nombre);
  // Garde-fous : minoré = ref − 30 %, majoré = ref + 20 %, meublé = ref + majoration (arrondis à 0,1).
  for (const [r, mi, ma] of [[ref, min, max], [refMeuble, minMeuble, maxMeuble]]) {
    if (Math.abs(r * 0.7 - mi) > 0.11 || Math.abs(r * 1.2 - ma) > 0.11) throw new Error(`Annexe 2 : valeurs incohérentes secteur ${secteur}, ${piece} p., ${epoque}`);
  }
  if (Math.abs(ref + majoration - refMeuble) > 0.11) throw new Error(`Annexe 2 : majoration meublée incohérente secteur ${secteur}`);
  const lignes = parSecteur.get(secteur) ?? [];
  lignes.push({ piece, epoque, meuble_txt: "non meublé", ref, max, min }, { piece, epoque, meuble_txt: "meublé", ref: refMeuble, max: maxMeuble, min: minMeuble });
  parSecteur.set(secteur, lignes);
});

// Noms et codes des quartiers repris du geojson, pour rester cohérent avec les polygones.
const geojson = JSON.parse(readFileSync("data/logement-encadrement-des-loyers.geojson", "utf8"));
const quartiers = new Map();
for (const { properties: p } of geojson.features) {
  if (!quartiers.has(p.id_quartier) || p.annee > quartiers.get(p.id_quartier).annee) quartiers.set(p.id_quartier, p);
}
const lignes = [];
for (const [id, secteur] of secteurs) {
  const q = quartiers.get(id);
  if (!q) throw new Error(`Quartier ${id} absent du geojson`);
  if (q.id_zone !== secteur) console.warn(`${q.nom_quartier} : secteur ${q.id_zone} en ${q.annee}, ${secteur} dans l'arrêté ${annee}`);
  for (const l of parSecteur.get(secteur)) {
    lignes.push({ annee, nom_quartier: q.nom_quartier, ...l, code_grand_quartier: q.code_grand_quartier });
  }
}

const reference = texte.match(/IDF-\d{4}-\d{2}-\d{2}-\d+/)?.[0];
const vigueur = texte.match(/entrent en vigueur à compter du (.+?)(?:\s+jusqu.au (.+?))?\./s);
const fichier = `data/encadrement-${annee}.json`;
writeFileSync(fichier, JSON.stringify({
  arrete: reference,
  source: /^https?:\/\//.test(source) ? source : undefined,
  vigueur: vigueur ? `à compter du ${vigueur[1].replace(/\s+/g, " ")}${vigueur[2] ? ` jusqu'au ${vigueur[2].replace(/\s+/g, " ")}` : ""}` : undefined,
  lignes,
}, null, 1) + "\n");
console.log(`${fichier} : ${lignes.length} lignes (${secteurs.size} quartiers, ${nbSecteurs} secteurs), arrêté ${reference}`);
