import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { calculerEncadrement } from "../popup/checkEncadrementLoyers.ts";

const geojson = JSON.parse(readFileSync("data/logement-encadrement-des-loyers.geojson", "utf8"));
const openData = geojson.features.map((f) => f.properties);
const arrete2026 = JSON.parse(readFileSync("data/encadrement-2026.json", "utf8"));
const ligne = (lignes, nom, piece, epoque, meuble_txt) =>
  lignes.find((l) => l.nom_quartier === nom && l.piece === piece && l.epoque === epoque && l.meuble_txt === meuble_txt);

test("Barème 2026 importé de l'arrêté : complet et aligné sur les quartiers de l'open data", () => {
  assert.equal(arrete2026.arrete, "IDF-2026-06-12-00003");
  assert.equal(arrete2026.lignes.length, 2560);
  assert.ok(arrete2026.lignes.every((l) => l.annee === "2026"));
  const codes2025 = new Set(openData.filter((p) => p.annee === "2025").map((p) => p.code_grand_quartier));
  const parQuartier = Map.groupBy(arrete2026.lignes, (l) => l.code_grand_quartier);
  assert.deepEqual(new Set(parQuartier.keys()), codes2025);
  assert.ok([...parQuartier.values()].every((lignes) => lignes.length === 32));
  assert.ok(!openData.some((p) => p.annee === "2026"), "2026 publié en open data : l'import n'est plus nécessaire");
});

test("Barème 2026 : valeurs relevées dans l'annexe 2 de l'arrêté", () => {
  // Rochechouart → secteur 5 ; Clignancourt → secteur 9 (annexe 1).
  assert.deepEqual(ligne(arrete2026.lignes, "Rochechouart", 2, "Avant 1946", "meublé"), {
    annee: "2026", nom_quartier: "Rochechouart", piece: 2, epoque: "Avant 1946", meuble_txt: "meublé",
    ref: 32.7, max: 39.2, min: 22.9, code_grand_quartier: 7510936,
  });
  const clignancourt = ligne(arrete2026.lignes, "Clignancourt", 3, "Avant 1946", "non meublé");
  assert.deepEqual([clignancourt.min, clignancourt.ref, clignancourt.max], [17.1, 24.4, 29.3]);
});

test("Le barème le plus récent est retenu : 2026 dès qu'il est fourni", () => {
  const lignes = [...openData, ...arrete2026.lignes];
  const rochechouart = { statut: "renseignee", quartiers: [{ id: 7510936, nom: "Rochechouart", arrondissement: 9 }], indices: [], avertissements: [] };
  const logement = { pieces: 2, meuble: true, nbM2: 36.5, prixMois: 1540 };
  const resultat = calculerEncadrement(logement, lignes, rochechouart);
  assert.equal(resultat.annee, "2026");
  assert.equal(resultat.max, 39.2);
  assert.equal(resultat.verdict, "depasse");
  assert.equal(calculerEncadrement(logement, openData, rochechouart).annee, "2025");
});
