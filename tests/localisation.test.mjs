import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import {
  AnalyseurProximite, DepotLocalisation, GeometrieLocale, LecteurJsonLd,
  NormaliseurLieu, ReferentielLieux, ReferentielQuartiers, ResolveurLocalisation,
} from "../popup/localisation.ts";
import { JinkaParseur } from "../popup/jinkaParseur.ts";
import { calculerEncadrement } from "../popup/checkEncadrementLoyers.ts";
import { convertirGeoJson } from "../scripts/convertir-geojson.mjs";

const geojson = JSON.parse(readFileSync("data/logement-encadrement-des-loyers.geojson", "utf8"));
const baremes = geojson.features.map((f) => f.properties);
const quartiersParis = [...new Map(geojson.features.map(({ properties: p, geometry }) => [p.code_grand_quartier, {
  id: p.code_grand_quartier, nom: p.nom_quartier,
  arrondissement: Math.floor(p.code_grand_quartier / 100) % 100, geometrie: geometry,
}])).values()];
const sansLieux = { sources: [], rues: [], stations: [] };
const paris = new ReferentielQuartiers(quartiersParis);
const resolveurParis = new ResolveurLocalisation(paris, new ReferentielLieux(sansLieux));
const indices = (modifications = {}) => ({ description: "", stations: [], coordonnees: [], ...modifications });

function exemple(surface) {
  const nom = readdirSync("exemplesJinka").find((n) => n.endsWith(".html") && n.includes(`${surface} m²`));
  const html = readFileSync(`exemplesJinka/${nom}`, "utf8");
  const url = html.match(/saved from url=\(\d+\)(https:\/\/[^\s]+)/)[1];
  return new JSDOM(html, { url }); // Pas d'exécution des scripts Jinka, pas de chargement réseau.
}

test("35 m² : extraction du DOM, charges, rue et stations, sans exécuter Jinka", () => {
  const dom = exemple(35);
  const logement = new JinkaParseur().parser(dom.window.document);
  assert.equal(logement.quartier, "Grenelle");
  assert.equal(logement.prixMois, 1290);
  assert.equal(logement.meuble, false);
  assert.equal(logement.nbM2, 35);
  assert.match(logement.indicesLocalisation.description, /rue Fondary/i);
  assert.deepEqual(logement.indicesLocalisation.stations, ["La Motte-Picquet-Grenelle", "Cambronne", "Avenue Emile-Zola", "Commerce"]);
  assert.deepEqual(logement.indicesLocalisation.coordonnees, [[2.29734, 48.8466]]);
  const localisation = resolveurParis.resoudre(logement.indicesLocalisation);
  assert.deepEqual(localisation.quartiers.map((q) => q.nom), ["Grenelle"]);
  assert.equal(calculerEncadrement(logement, baremes, localisation).verdict, "depasse");
  dom.window.close();
});

test("37 m² : ignore l'ancienne annonce et l'URL canonique périmée", () => {
  const dom = exemple(37);
  assert.notEqual(new URL(dom.window.document.querySelector('link[rel="canonical"]').href).pathname, dom.window.location.pathname);
  const logement = new JinkaParseur().parser(dom.window.document);
  assert.equal(logement.quartier, "Javel");
  assert.equal(logement.prixMois, 1374);
  assert.equal(logement.meuble, true);
  assert.deepEqual(logement.indicesLocalisation.coordonnees, [[2.28787, 48.8454]]);
  assert.deepEqual(logement.indicesLocalisation.stations, ["Charles Michels", "Boucicaut", "Félix Faure", "Commerce"]);
  const localisation = resolveurParis.resoudre(logement.indicesLocalisation);
  assert.deepEqual(localisation.quartiers.map((q) => q.id), [7511560]);
  const resultat = calculerEncadrement(logement, baremes, localisation);
  assert.equal(resultat.quartier, "Javel 15Art");
  assert.equal(resultat.max, 38.3);
  assert.equal(resultat.verdict, "indetermine");
  dom.window.close();
});

test("Sans quartier, les coordonnées Jinka classent sans exclure les autres quartiers du 15e", () => {
  const dom = exemple(37);
  dom.window.document.querySelector("h1").parentElement.nextElementSibling.querySelector("span:has(svg)").remove();
  const logement = new JinkaParseur().parser(dom.window.document);
  const resultat = resolveurParis.resoudre(logement.indicesLocalisation);
  assert.equal(resultat.statut, "ambigue");
  assert.equal(resultat.quartiers.length, 4);
  assert.equal(resultat.quartiers[0].id, 7511560);
  assert.ok(resultat.avertissements.some((a) => a.includes("non résolue")));
  dom.window.close();
});

test("JSON-LD : JSON malformé, autre annonce et URL étrangère sont ignorés", () => {
  const dom = exemple(37);
  const script = dom.window.document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = "{invalide";
  dom.window.document.body.append(script);
  const lecteur = new LecteurJsonLd();
  assert.equal(lecteur.coordonnees(dom.window.document, dom.window.location.href).length, 1);
  assert.deepEqual(lecteur.coordonnees(dom.window.document, "https://www.jinka.fr/ad/autre"), []);
  assert.deepEqual(lecteur.coordonnees(dom.window.document, "https://jinka.fr.evil.example/ad/autre"), []);
  assert.deepEqual(lecteur.coordonnees(dom.window.document, "file:///annonce.html"), []);
  dom.window.close();
});

test("JSON-LD : tableaux et @graph, validation des nombres et dédoublonnage", () => {
  const dom = new JSDOM('<script type="application/ld+json"></script>', { url: "https://jinka.fr/ad/test" });
  const annonce = { "@type": ["RealEstateListing"], url: "https://www.jinka.fr/ad/test?x=1", mainEntity: { geo: { longitude: 2.3, latitude: 48.85 } } };
  dom.window.document.querySelector("script").textContent = JSON.stringify({ "@graph": [annonce, annonce, { ...annonce, mainEntity: { geo: { longitude: "2.3", latitude: 48.85 } } }] });
  assert.deepEqual(new LecteurJsonLd().coordonnees(dom.window.document, dom.window.location.href), [[2.3, 48.85]]);
  dom.window.close();
});

test("Les coordonnées des exemples tombent dans les polygones attendus", () => {
  assert.deepEqual(paris.autour([2.29734, 48.8466]).map((q) => q.nom), ["Grenelle"]);
  assert.deepEqual(paris.autour([2.28787, 48.8454]).map((q) => q.nom), ["Javel 15Art"]);
  assert.deepEqual(paris.autour([NaN, 48.85]), []);
});

test("Normalisation des accents, tirets, abréviations et alias Javel", () => {
  assert.equal(NormaliseurLieu.normaliser("SAINTE–ÉMILIE"), "ste emilie");
  assert.equal(NormaliseurLieu.normaliser("bd. Émile-Zola"), "boulevard emile zola");
  assert.equal(NormaliseurLieu.arrondissement("75015"), 15);
  assert.equal(NormaliseurLieu.arrondissement("69003"), undefined);
  assert.equal(paris.parNom("javel")[0].id, 7511560);
  assert.equal(paris.parNom("Saint-Germain-l’Auxerrois")[0].id, 7510101);
});

const carre = (x1, x2, y1 = 48.85, y2 = 48.86) => ({ type: "Polygon", coordinates: [
  [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]],
] });
const quartiersTest = [
  { id: 1, nom: "Ouest", arrondissement: 15, geometrie: carre(2.3, 2.31) },
  { id: 2, nom: "Est", arrondissement: 15, geometrie: carre(2.31, 2.32) },
  { id: 3, nom: "Autre", arrondissement: 14, geometrie: carre(2.32, 2.33) },
];
const rue = { id: "r1", nom: "rue Exemple", lignes: [[[2.305, 48.852], [2.305, 48.858]]] };
const station = { id: "s1", nom: "Station Exemple", positions: [[2.305, 48.855]] };
const lieuxTest = { sources: [], rues: [rue], stations: [station] };
const quartiers = new ReferentielQuartiers(quartiersTest);
const resolveur = new ResolveurLocalisation(quartiers, new ReferentielLieux(lieuxTest));

test("Rue reconnue sans numéro : restriction locale et provenance conservée", () => {
  const resultat = resolveur.resoudre(indices({ arrondissement: 15, description: "RUE EXEMPLE, au premier étage." }));
  assert.equal(resultat.statut, "estimee");
  assert.deepEqual(resultat.quartiers.map((q) => q.id), [1]);
  assert.equal(resultat.indices[0].source, "Description de l'annonce");
});

test("Rue seulement proche : ne pas confondre proximité et adresse", () => {
  const resultat = resolveur.resoudre(indices({ arrondissement: 15, description: "À proximité de la rue Exemple, appartement calme." }));
  assert.equal(resultat.quartiers.length, 2);
  assert.equal(resultat.indices[0].contraignant, false);
});

test("Rue sur une frontière : conserver les deux côtés", () => {
  assert.deepEqual(quartiers.leLongDe({ ...rue, lignes: [[[2.31, 48.852], [2.31, 48.858]]] }).map((q) => q.id), [1, 2]);
  assert.deepEqual(quartiers.autour([2.31, 48.855]).map((q) => q.id), [1, 2]);
});

test("Rue traversante : détecter une intersection même sans sommet à l'intérieur", () => {
  assert.equal(GeometrieLocale.croiseRue(carre(2.3, 2.31), [[[2.29, 48.855], [2.32, 48.855]]]), true);
});

test("Polygones à trous et MultiPolygon", () => {
  const trou = carre(2.3, 2.31);
  trou.coordinates.push(carre(2.303, 2.307, 48.853, 48.857).coordinates[0]);
  assert.equal(GeometrieLocale.contient(trou, [2.305, 48.855]), false);
  assert.equal(GeometrieLocale.contient(trou, [2.301, 48.851]), true);
  assert.equal(GeometrieLocale.contient({ type: "MultiPolygon", coordinates: [trou.coordinates, carre(2.32, 2.33).coordinates] }, [2.325, 48.855]), true);
});

test("Quartier Jinka reconnu : il prime sur la rue, sans chercher plus loin", () => {
  const resultat = resolveur.resoudre(indices({ arrondissement: 15, quartier: "Est", description: "Rue Exemple, appartement." }));
  assert.equal(resultat.statut, "renseignee");
  assert.deepEqual(resultat.quartiers.map((q) => q.id), [2]);
  assert.deepEqual(resultat.avertissements, []);
});

test("Quartier incompatible avec l'arrondissement : pas de priorité silencieuse", () => {
  const resultat = resolveur.resoudre(indices({ arrondissement: 15, quartier: "Autre" }));
  assert.equal(resultat.statut, "ambigue");
  assert.equal(resultat.quartiers.length, 3);
});

test("Sans lieu identifiable, aucun quartier inventé", () => {
  assert.equal(resolveur.resoudre(indices({ description: "Appartement agréable" })).statut, "introuvable");
  assert.equal(resolveur.resoudre(indices({ quartier: "Inexistant" })).quartiers.length, 0);
});

test("Stations et durées de marche : classement indicatif, aucun quartier éliminé", () => {
  const resultat = resolveur.resoudre(indices({ arrondissement: 15, description: "À 5 min à pied du métro Station Exemple." }));
  assert.equal(resultat.quartiers.length, 2);
  assert.equal(resultat.indices[0].contraignant, false);
  assert.match(resultat.indices[0].source, /550 m/);
  assert.equal(new AnalyseurProximite().rayonIndicatif("À 5 min en voiture de Station Exemple", "Station Exemple"), 800);
});

test("Noms de station ambigus : pas de détection hors contexte transport", () => {
  const lieux = new ReferentielLieux({ ...sansLieux, stations: [{ ...station, nom: "Commerce" }] });
  assert.deepEqual(lieux.stationsDans("Cuisine près d'un commerce"), []);
  assert.deepEqual(lieux.stationsDans("À proximité du métro Commerce"), ["Commerce"]);
});

test("Le dictionnaire privilégie le nom de rue complet", () => {
  const lieux = new ReferentielLieux({ ...sansLieux, rues: [rue, { ...rue, id: "r2", nom: "rue Exemple prolongée" }] });
  assert.deepEqual(lieux.ruesDans("Rue Exemple prolongée, appartement.").filter((r) => r.rue).map((r) => r.rue.id), ["r2"]);
  assert.equal(lieux.ruesDans("Rue Exemple et rue Exemple prolongée.").filter((r) => r.rue).length, 2);
});

test("Coordonnées contradictoires : signaler l'incertitude sans les traiter comme une adresse", () => {
  const resultat = resolveur.resoudre(indices({ arrondissement: 15, description: "Rue Exemple, appartement.", coordonnees: [[2.325, 48.855]] }));
  assert.equal(resultat.statut, "ambigue");
  assert.ok(resultat.avertissements.some((a) => a.includes("ne concordent pas")));
});

const localisationTest = resolveur.resoudre(indices({ arrondissement: 15 }));
const lignesTest = [20, 30].map((max, i) => ({
  annee: "2025", nom_quartier: quartiersTest[i].nom, code_grand_quartier: i + 1,
  piece: 2, epoque: "Avant 1946", meuble_txt: "non meublé", min: 10, ref: 15, max,
}));
test("Verdicts : trois cas et seuils exacts, selon les plafonds majorés", () => {
  for (const [prixMois, attendu] of [[1000, "sous_plafonds"], [1250, "indetermine"], [1500, "indetermine"], [1500.01, "depasse"]]) {
    const resultat = calculerEncadrement({ prixMois, nbM2: 50 }, lignesTest, localisationTest);
    assert.equal(resultat.verdict, attendu);
    assert.equal(resultat.plafondMin, 20);
  }
});

test("Barème incomplet ou surface invalide : aucun verdict affirmatif", () => {
  assert.equal(calculerEncadrement({ nbM2: 50, prixMois: 1000 }, lignesTest.slice(0, 1), localisationTest), null);
  for (const nbM2 of [0, -1, NaN, Infinity]) {
    assert.equal(calculerEncadrement({ nbM2, prixMois: 1000 }, lignesTest, localisationTest).verdict, "inconnu");
  }
});

test("Charges absentes : ne pas traiter automatiquement le prix CC comme hors charges", () => {
  const dom = exemple(35);
  const h2 = [...dom.window.document.querySelectorAll("h2")].find((h) => h.textContent === "Description");
  h2.nextElementSibling.textContent = "Rue Fondary, appartement non meublé.";
  assert.equal(new JinkaParseur().parser(dom.window.document).prixMois, undefined);
  dom.window.close();
});

test("Import local : agrégation des lignes, noms officiels et rejet des projections incorrectes", () => {
  const feature = { type: "Feature", properties: { n_sq_vo: 1, l_longmin: "rue Exemple" }, geometry: { type: "LineString", coordinates: rue.lignes[0] } };
  const collection = { type: "FeatureCollection", features: [feature, feature] };
  assert.equal(convertirGeoJson(collection, "rues")[0].lignes.length, 1);
  const invalide = structuredClone(collection);
  invalide.features[0].geometry.coordinates = [[600000, 120000], [600100, 120100]];
  assert.throws(() => convertirGeoJson(invalide, "rues"), /WGS84/);
  assert.throws(() => convertirGeoJson({ type: "FeatureCollection", features: [] }, "rues"), /non vide/);
});

test("Dépôt : uniquement des ressources locales, chargement unique et réessai après erreur", async (t) => {
  const appels = [];
  let echec = true;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.ok(url.startsWith("chrome-extension://test/data/"));
    appels.push(url);
    return { ok: !echec, json: async () => url.endsWith("quartiers.json") ? quartiersTest : lieuxTest };
  });
  const ancienChrome = globalThis.chrome;
  globalThis.chrome = { runtime: { getURL: (p) => `chrome-extension://test/${p}` } };
  t.after(() => { if (ancienChrome === undefined) delete globalThis.chrome; else globalThis.chrome = ancienChrome; });
  const depot = new DepotLocalisation();
  await assert.rejects(depot.localiser(indices({ arrondissement: 15 })), /indisponible/);
  echec = false;
  assert.equal((await depot.localiser(indices({ arrondissement: 15 }))).quartiers.length, 2);
  await depot.localiser(indices({ arrondissement: 15 }));
  assert.equal(appels.length, 4);
});

test("Popup complet : annonce Jinka → fichiers locaux → verdict et texte échappé", async () => {
  const annonce = exemple(37);
  const logement = new JinkaParseur().parser(annonce.window.document);
  logement.indicesLocalisation.quartier = 'Inconnu <img src=x onerror="alert(1)">';
  const popup = new JSDOM('<div id="resultat"></div><div id="details"></div>', { runScripts: "outside-only" });
  const { window } = popup;
  window.chrome = {
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
    tabs: { query: async () => [{ id: 1 }], sendMessage: async () => ({ logement }) },
  };
  window.fetch = async (url) => {
    assert.ok(url.startsWith("chrome-extension://test/data/"));
    return { ok: true, json: async () => url.endsWith("encadrement.json") ? baremes : url.endsWith("quartiers.json") ? quartiersParis : sansLieux };
  };
  const compilation = await build({ entryPoints: ["popup/popup.ts"], bundle: true, write: false, format: "iife" });
  window.eval(compilation.outputFiles[0].text);
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(window.document.getElementById("resultat").textContent, /indéterminé/);
  assert.match(window.document.getElementById("details").textContent, /<img src=x/);
  assert.equal(window.document.querySelector("img"), null);
  assert.match(window.document.getElementById("details").textContent, /barème 2025/);
  annonce.window.close();
  popup.window.close();
});
