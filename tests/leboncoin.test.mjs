import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { ReferentielQuartiers, ResolveurLocalisation } from "../popup/localisation.ts";
import { LeboncoinParseur } from "../popup/leboncoinParseur.ts";
import { JinkaParseur } from "../popup/jinkaParseur.ts";
import { calculerEncadrement } from "../popup/checkEncadrementLoyers.ts";

// Les pages d'annonces enregistrées (exemplesLBC/) ne sont pas versionnées : sans elles, ces tests sont sautés.
const testExemple = existsSync("exemplesLBC") ? test : test.skip;

const geojson = JSON.parse(readFileSync("data/logement-encadrement-des-loyers.geojson", "utf8"));
const baremes = geojson.features.map((f) => f.properties);
const paris = new ReferentielQuartiers([...new Map(geojson.features.map(({ properties: p, geometry }) => [p.code_grand_quartier, {
  id: p.code_grand_quartier, nom: p.nom_quartier,
  arrondissement: Math.floor(p.code_grand_quartier / 100) % 100, geometrie: geometry,
}])).values()]);
const resolveurParis = new ResolveurLocalisation(paris);

function exemple(debutTitre) {
  const nom = readdirSync("exemplesLBC").find((n) => n.endsWith(".html") && n.includes(debutTitre));
  const html = readFileSync(`exemplesLBC/${nom}`, "utf8");
  const url = html.match(/saved from url=\(\d+\)(https:\/\/[^\s]+)/)[1];
  return new JSDOM(html, { url }); // Pas d'exécution des scripts Leboncoin, pas de chargement réseau.
}
function detailPrix(doc) {
  const h2 = [...doc.querySelectorAll("h2")].find((h) => h.textContent.trim() === "Détail du prix");
  return h2.closest("section") ?? h2.parentElement;
}

test("Leboncoin : seules les annonces de location sont prises", () => {
  const parseur = new LeboncoinParseur();
  assert.equal(parseur.peutParser(new URL("https://www.leboncoin.fr/ad/locations/3313004919")), true);
  assert.equal(parseur.peutParser(new URL("https://www.leboncoin.fr/locations/3313004919.htm")), true);
  assert.equal(parseur.peutParser(new URL("https://www.leboncoin.fr/ad/ventes_immobilieres/3313004919")), false);
  assert.equal(parseur.peutParser(new URL("https://leboncoin.fr.evil.example/ad/locations/1")), false);
  assert.equal(new JinkaParseur().peutParser(new URL("https://www.leboncoin.fr/ad/locations/1")), false);
});

testExemple("36,50 m² meublé : critères, loyer hors charges du détail du prix, quartier affiché", () => {
  const dom = exemple("36,50m2");
  const logement = new LeboncoinParseur().parser(dom.window.document);
  assert.equal(logement.quartier, "Rochechouart");
  assert.equal(logement.arrondissement, 9);
  assert.equal(logement.pieces, 2);
  assert.equal(logement.nbM2, 36.5);
  assert.equal(logement.prixMois, 1540);
  assert.equal(logement.chargesInconnues, false);
  assert.equal(logement.meuble, true);
  assert.equal(logement.epoque, undefined);
  assert.equal(logement.indicesLocalisation.site, "Leboncoin");
  assert.deepEqual(logement.indicesLocalisation.coordonnees, []);
  assert.match(logement.indicesLocalisation.texte, /rue Marie Eléonore de Bellefond/);
  const localisation = resolveurParis.resoudre(logement.indicesLocalisation);
  assert.equal(localisation.statut, "renseignee");
  assert.deepEqual(localisation.quartiers.map((q) => q.nom), ["Rochechouart"]);
  assert.equal(localisation.indices[0].source, "Quartier affiché par Leboncoin");
  // 1 540 € / 36,5 m² = 42,2 €/m², au-dessus du plus haut plafond majoré (37,9 €/m², avant 1946).
  const resultat = calculerEncadrement(logement, baremes, localisation);
  assert.equal(resultat.verdict, "depasse");
  dom.window.close();
});

testExemple("54 m² : année de construction, quartier Leboncoin hors référentiel signalé", () => {
  const dom = exemple("54 m²");
  const logement = new LeboncoinParseur().parser(dom.window.document);
  assert.equal(logement.quartier, "Jules Joffrin");
  assert.equal(logement.arrondissement, 18);
  assert.equal(logement.pieces, 3);
  assert.equal(logement.nbM2, 54);
  assert.equal(logement.prixMois, 1830);
  assert.equal(logement.meuble, undefined);
  assert.equal(logement.epoque, "Avant 1946");
  const localisation = resolveurParis.resoudre(logement.indicesLocalisation);
  assert.ok(localisation.avertissements.includes("Quartier non reconnu : Jules Joffrin."));
  // « au coeur du quartier de Clignancourt » dans la description départage les 4 quartiers du 18e.
  assert.deepEqual(localisation.quartiers.map((q) => q.nom), ["Clignancourt"]);
  dom.window.close();
});

testExemple("Sans loyer hors charges détaillé : prix moins les charges prévisionnelles", () => {
  const dom = exemple("54 m²");
  const doc = dom.window.document;
  [...detailPrix(doc).querySelectorAll("p")].find((p) => p.textContent.trim() === "Loyer hors charges").parentElement.remove();
  const logement = new LeboncoinParseur().parser(doc);
  assert.equal(logement.prixMois, 1990 - 160);
  assert.equal(logement.chargesInconnues, false);
  dom.window.close();
});

testExemple("Sans détail du prix : charges lues dans la description, sinon hypothèse signalée", () => {
  const dom = exemple("54 m²");
  const doc = dom.window.document;
  detailPrix(doc).remove();
  const description = doc.querySelector('[data-qa-id="adview_description_container"]');
  description.textContent = "Loyer 1 990 € dont 160 € de charges.";
  assert.equal(new LeboncoinParseur().parser(doc).prixMois, 1830);
  description.textContent = "Bel appartement.";
  const sansCharges = new LeboncoinParseur().parser(doc);
  assert.equal(sansCharges.prixMois, 1990);
  assert.equal(sansCharges.chargesInconnues, true);
  doc.querySelector('[data-qa-id="criteria_item_charges_included"] [title]').textContent = "Non";
  assert.equal(new LeboncoinParseur().parser(doc).chargesInconnues, false);
  dom.window.close();
});

testExemple("Encart « Transports à proximité » ajouté au texte, après la description", () => {
  const dom = exemple("36,50m2");
  const { texte } = new LeboncoinParseur().parser(dom.window.document).indicesLocalisation;
  assert.match(texte, /\nTransports à proximité : Métro Poissonnière ; Métro Cadet ; Métro Le Peletier$/);
  dom.window.close();
});

testExemple("Encart non rendu (section Localisation hors écran) : texte limité au titre et à la description", () => {
  const dom = exemple("54 m²");
  const { texte } = new LeboncoinParseur().parser(dom.window.document).indicesLocalisation;
  assert.doesNotMatch(texte, /Transports à proximité/);
  assert.match(texte, /Métro Jules Joffrin \(ligne 12\)/);
  dom.window.close();
});

testExemple("Quartier cité dans le texte : il vote, sans écraser les autres indices", () => {
  const dom = exemple("54 m²");
  const { indicesLocalisation } = new LeboncoinParseur().parser(dom.window.document);
  const resultat = resolveurParis.resoudre(indicesLocalisation);
  assert.equal(resultat.statut, "estimee");
  assert.deepEqual(resultat.quartiers.map((q) => q.nom), ["Clignancourt"]);
  assert.ok(resultat.indices.some((i) => i.source === "Quartier cité dans l'annonce" && i.libelle === "Clignancourt"));
  dom.window.close();
});

test("Quartier cité : le nom doit suivre le mot « quartier »", () => {
  const noms = (texte) => paris.citesDans(texte).map((q) => q.nom);
  assert.deepEqual(noms("Au coeur du quartier de Clignancourt, près de Montmartre"), ["Clignancourt"]);
  assert.deepEqual(noms("Quartier Saint-Georges, rue des Martyrs"), ["Saint-Georges"]);
  assert.deepEqual(noms("dans le quartier des Halles"), ["Halles"]);
  assert.deepEqual(noms("quartier calme, proche de la gare et du métro Europe"), []);
  assert.deepEqual(noms("Gare de Lyon, Europe, Combat"), []);
});
