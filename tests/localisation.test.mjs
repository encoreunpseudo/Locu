import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import {
  DepotLocalisation, DetecteurLieux, ExtracteurLocalisationJinka, GeometrieLocale, LecteurJsonLd,
  NormaliseurLieu, ReferentielQuartiers, ResolveurLocalisation, SourcesLieux,
} from "../popup/localisation.ts";
import { JinkaParseur } from "../popup/jinkaParseur.ts";
import { calculerEncadrement } from "../popup/checkEncadrementLoyers.ts";

// Les pages d'annonces enregistrées (exemplesJinka/) ne sont pas versionnées : sans elles, ces tests sont sautés.
const testExemple = existsSync("exemplesJinka") && readdirSync("exemplesJinka").some((n) => n.endsWith(".html")) ? test : test.skip;

const geojson = JSON.parse(readFileSync("data/logement-encadrement-des-loyers.geojson", "utf8"));
const baremes = geojson.features.map((f) => f.properties);
const lieux = JSON.parse(readFileSync("tests/fixtures/lieux-paris15.json", "utf8"));
// Répond comme les API ouvertes (Ville de Paris, IDFM) à partir d'extraits figés : aucun réseau dans les tests.
function requeteFixe(appels = []) {
  return async (url) => {
    appels.push(url);
    const u = decodeURIComponent(url);
    const corps = u.includes("emplacement-des-gares") ? lieux.gares
      : u.includes("geo_shape") ? lieux.traces[u.match(/typo_min="([^"]+)"/)[1]] ?? []
      : lieux.voies;
    return { ok: true, json: async () => corps };
  };
}
function stockageMemoire() {
  const valeurs = new Map();
  return { valeurs, lire: async (cle) => valeurs.get(cle), ecrire: async (cle, valeur) => { valeurs.set(cle, valeur); } };
}
const quartiersParis = [...new Map(geojson.features.map(({ properties: p, geometry }) => [p.code_grand_quartier, {
  id: p.code_grand_quartier, nom: p.nom_quartier,
  arrondissement: Math.floor(p.code_grand_quartier / 100) % 100, geometrie: geometry,
}])).values()];
const paris = new ReferentielQuartiers(quartiersParis);
const resolveurParis = new ResolveurLocalisation(paris);
const indices = (modifications = {}) => ({ coordonnees: [], ...modifications });

function exemple(surface) {
  const nom = readdirSync("exemplesJinka").find((n) => n.endsWith(".html") && n.includes(`${surface} m²`));
  const html = readFileSync(`exemplesJinka/${nom}`, "utf8");
  const url = html.match(/saved from url=\(\d+\)(https:\/\/[^\s]+)/)[1];
  return new JSDOM(html, { url }); // Pas d'exécution des scripts Jinka, pas de chargement réseau.
}

testExemple("35 m² : extraction du DOM et des charges, sans exécuter Jinka", () => {
  const dom = exemple(35);
  const logement = new JinkaParseur().parser(dom.window.document);
  assert.equal(logement.quartier, "Grenelle");
  assert.equal(logement.prixMois, 1290);
  assert.equal(logement.meuble, false);
  assert.equal(logement.nbM2, 35);
  assert.deepEqual(logement.indicesLocalisation.coordonnees, [[2.29734, 48.8466]]);
  const localisation = resolveurParis.resoudre(logement.indicesLocalisation);
  assert.deepEqual(localisation.quartiers.map((q) => q.nom), ["Grenelle"]);
  assert.equal(calculerEncadrement(logement, baremes, localisation).verdict, "depasse");
  dom.window.close();
});

testExemple("37 m² : ignore l'ancienne annonce et l'URL canonique périmée", () => {
  const dom = exemple(37);
  assert.notEqual(new URL(dom.window.document.querySelector('link[rel="canonical"]').href).pathname, dom.window.location.pathname);
  const logement = new JinkaParseur().parser(dom.window.document);
  assert.equal(logement.quartier, "Javel");
  assert.equal(logement.prixMois, 1374);
  assert.equal(logement.meuble, true);
  assert.deepEqual(logement.indicesLocalisation.coordonnees, [[2.28787, 48.8454]]);
  const localisation = resolveurParis.resoudre(logement.indicesLocalisation);
  assert.deepEqual(localisation.quartiers.map((q) => q.id), [7511560]);
  assert.equal(localisation.statut, "renseignee");
  assert.deepEqual(localisation.avertissements, []);
  const resultat = calculerEncadrement(logement, baremes, localisation);
  assert.equal(resultat.quartier, "Javel 15Art");
  assert.equal(resultat.max, 38.3);
  assert.equal(resultat.verdict, "indetermine");
  dom.window.close();
});

testExemple("Sans quartier affiché, la position de l'annonce donne une estimation", () => {
  const dom = exemple(37);
  dom.window.document.querySelector("h1").parentElement.nextElementSibling.querySelector("span:has(svg)").remove();
  const logement = new JinkaParseur().parser(dom.window.document);
  const resultat = resolveurParis.resoudre(logement.indicesLocalisation);
  assert.equal(resultat.statut, "estimee");
  assert.deepEqual(resultat.quartiers.map((q) => q.id), [7511560]);
  dom.window.close();
});

test("Sans quartier ni position, tous les quartiers de l'arrondissement sont conservés", () => {
  const resultat = resolveurParis.resoudre(indices({ arrondissement: 15 }));
  assert.equal(resultat.statut, "ambigue");
  assert.equal(resultat.quartiers.length, 4);
});

testExemple("JSON-LD : JSON malformé, autre annonce et URL étrangère sont ignorés", () => {
  const dom = exemple(37);
  const script = dom.window.document.createElement("script");
  script.type = "application/ld+json";
  script.textContent = "{invalide";
  dom.window.document.body.append(script);
  const lecteur = new LecteurJsonLd(ExtracteurLocalisationJinka.identifiantAnnonce);
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
  assert.deepEqual(new LecteurJsonLd(ExtracteurLocalisationJinka.identifiantAnnonce).coordonnees(dom.window.document, dom.window.location.href), [[2.3, 48.85]]);
  dom.window.close();
});

test("Les coordonnées des exemples tombent dans les polygones attendus", () => {
  assert.deepEqual(paris.contenant([2.29734, 48.8466]).map((q) => q.nom), ["Grenelle"]);
  assert.deepEqual(paris.contenant([2.28787, 48.8454]).map((q) => q.nom), ["Javel 15Art"]);
  assert.deepEqual(paris.contenant([NaN, 48.85]), []);
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
const quartiers = new ReferentielQuartiers(quartiersTest);
const resolveur = new ResolveurLocalisation(quartiers);

test("Point sur une frontière : conserver les deux quartiers", () => {
  assert.deepEqual(quartiers.contenant([2.31, 48.855]).map((q) => q.id), [1, 2]);
  const resultat = resolveur.resoudre(indices({ arrondissement: 15, coordonnees: [[2.31, 48.855]] }));
  assert.equal(resultat.statut, "ambigue");
  assert.equal(resultat.quartiers.length, 2);
});

test("Polygones à trous et MultiPolygon", () => {
  const trou = carre(2.3, 2.31);
  trou.coordinates.push(carre(2.303, 2.307, 48.853, 48.857).coordinates[0]);
  assert.equal(GeometrieLocale.contient(trou, [2.305, 48.855]), false);
  assert.equal(GeometrieLocale.contient(trou, [2.301, 48.851]), true);
  assert.equal(GeometrieLocale.contient({ type: "MultiPolygon", coordinates: [trou.coordinates, carre(2.32, 2.33).coordinates] }, [2.325, 48.855]), true);
});

test("Quartier affiché reconnu : il prime sur la position", () => {
  const resultat = resolveur.resoudre(indices({ arrondissement: 15, quartier: "Est", coordonnees: [[2.305, 48.855]] }));
  assert.equal(resultat.statut, "renseignee");
  assert.deepEqual(resultat.quartiers.map((q) => q.id), [2]);
});

test("Quartier incompatible avec l'arrondissement : pas de priorité silencieuse", () => {
  const resultat = resolveur.resoudre(indices({ arrondissement: 15, quartier: "Autre" }));
  assert.equal(resultat.statut, "ambigue");
  assert.equal(resultat.quartiers.length, 3);
  assert.ok(resultat.avertissements.some((a) => a.includes("ne correspond pas")));
});

test("Position hors de l'arrondissement : ignorée", () => {
  const resultat = resolveur.resoudre(indices({ arrondissement: 15, coordonnees: [[2.325, 48.855]] }));
  assert.equal(resultat.statut, "ambigue");
  assert.equal(resultat.quartiers.length, 2);
});

test("Sans lieu identifiable, aucun quartier inventé", () => {
  assert.equal(resolveur.resoudre(indices()).statut, "introuvable");
  assert.equal(resolveur.resoudre(indices({ quartier: "Inexistant" })).quartiers.length, 0);
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

testExemple("Charges absentes : prix affiché pris comme hors charges, hypothèse signalée", () => {
  const dom = exemple(35);
  const h2 = [...dom.window.document.querySelectorAll("h2")].find((h) => h.textContent === "Description");
  h2.nextElementSibling.textContent = "Rue Fondary, appartement non meublé.";
  const logement = new JinkaParseur().parser(dom.window.document);
  assert.equal(logement.prixMois, 1390);
  assert.equal(logement.chargesInconnues, true);
  dom.window.close();
});

test("Charges absentes : charges minimales pour passer sous le plafond", () => {
  // Plafonds 20 et 30 €/m² sur 50 m² : 1 000 € et 1 500 € /mois.
  const depasse = calculerEncadrement({ prixMois: 1620.5, nbM2: 50, chargesInconnues: true }, lignesTest, localisationTest);
  assert.equal(depasse.verdict, "depasse");
  assert.equal(depasse.chargesMin, 121);
  const conforme = calculerEncadrement({ prixMois: 900, nbM2: 50, chargesInconnues: true }, lignesTest, localisationTest);
  assert.equal(conforme.verdict, "sous_plafonds");
  assert.equal(conforme.chargesInconnues, true);
  assert.equal(conforme.chargesMin, null);
  const connues = calculerEncadrement({ prixMois: 1620.5, nbM2: 50 }, lignesTest, localisationTest);
  assert.equal(connues.chargesMin, null);
});

test("Dépôt : sans description, uniquement des ressources locales, chargement unique et réessai après erreur", async (t) => {
  const appels = [];
  let echec = true;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.ok(url.startsWith("chrome-extension://test/data/"));
    appels.push(url);
    return { ok: !echec, json: async () => quartiersTest };
  });
  const ancienChrome = globalThis.chrome;
  globalThis.chrome = { runtime: { getURL: (p) => `chrome-extension://test/${p}` } };
  t.after(() => { if (ancienChrome === undefined) delete globalThis.chrome; else globalThis.chrome = ancienChrome; });
  const depot = new DepotLocalisation();
  await assert.rejects(depot.localiser(indices({ arrondissement: 15 })), /indisponible/);
  echec = false;
  assert.equal((await depot.localiser(indices({ arrondissement: 15 }))).quartiers.length, 2);
  await depot.localiser(indices({ arrondissement: 15 }));
  assert.equal(appels.length, 2);
});

testExemple("Popup complet : annonce Jinka → fichiers locaux → verdict et texte échappé", async () => {
  const annonce = exemple(37);
  const logement = new JinkaParseur().parser(annonce.window.document);
  logement.indicesLocalisation.quartier = 'Inconnu <img src=x onerror="alert(1)">';
  const popup = new JSDOM('<div id="resultat"></div><div id="details"></div>', { runScripts: "outside-only" });
  const { window } = popup;
  window.chrome = {
    runtime: { getURL: (p) => `chrome-extension://test/${p}` },
    tabs: { query: async () => [{ id: 1 }], sendMessage: async () => ({ logement }) },
  };
  const lieuxEnLigne = requeteFixe();
  window.fetch = async (url) => {
    if (!url.startsWith("chrome-extension://test/data/")) return lieuxEnLigne(url);
    return { ok: true, json: async () => url.endsWith("encadrement.json") ? baremes : quartiersParis };
  };
  const compilation = await build({ entryPoints: ["popup/popup.ts"], bundle: true, write: false, format: "iife" });
  window.eval(compilation.outputFiles[0].text);
  await new Promise((resolve) => setImmediate(resolve));
  // Quartier non reconnu : la position de l'annonce retrouve Javel, seule l'époque reste inconnue.
  assert.match(window.document.getElementById("resultat").textContent, /sauf si l'immeuble a été construit après 1990/i);
  assert.match(window.document.getElementById("details").textContent, /position approximative/);
  assert.match(window.document.getElementById("details").textContent, /Station citée dans l'annonce : Charles Michels \(METRO 10\)/);
  assert.match(window.document.getElementById("details").textContent, /Position estimée : Position de l'annonce \(à 150 m près\)/);
  assert.match(window.document.getElementById("details").textContent, /<img src=x/);
  assert.equal(window.document.querySelector("img"), null);
  assert.match(window.document.getElementById("details").textContent, /barème 2025/i);
  annonce.window.close();
  popup.window.close();
});

// --- Rues et stations citées dans l'annonce ---

function simulerExtension(t) {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => quartiersParis }));
  const ancienChrome = globalThis.chrome;
  globalThis.chrome = { runtime: { getURL: (p) => `chrome-extension://test/${p}` } };
  t.after(() => { if (ancienChrome === undefined) delete globalThis.chrome; else globalThis.chrome = ancienChrome; });
}
const depotAvecLieux = (requete = requeteFixe()) => new DepotLocalisation(new SourcesLieux(requete, stockageMemoire()));

// Annonce d'exemple sans quartier affiché, et sans position si demandé.
function annonceSansQuartier(surface, { sansPosition = false } = {}) {
  const dom = exemple(surface);
  const doc = dom.window.document;
  doc.querySelector("h1").parentElement.nextElementSibling.querySelector("span:has(svg)").remove();
  if (sansPosition) doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => s.remove());
  const logement = new JinkaParseur().parser(doc);
  dom.window.close();
  return logement.indicesLocalisation;
}

test("Détecteur : rues et stations du référentiel retrouvées dans le texte", async () => {
  const sources = new SourcesLieux(requeteFixe(), stockageMemoire());
  const detecteur = new DetecteurLieux(await sources.voies(), await sources.stations());
  const trouve = detecteur.detecter("RUE DE LOURMEL, proche M° Charles-Michels et Javel, villa Fondary.", 15);
  assert.deepEqual(trouve.rues.map((r) => r.nom), ["rue de Lourmel", "villa Fondary"]);
  assert.deepEqual(trouve.rues[0].quartiers, ["Grenelle", "Javel"]);
  assert.deepEqual(trouve.stations.map((s) => s.nom).sort(), ["Charles Michels", "Javel", "Javel - André Citroën"]);
  assert.deepEqual(trouve.stations.find((s) => s.nom === "Charles Michels").lignes, ["METRO 10"]);
  // Hors arrondissement : la voie est ignorée.
  assert.deepEqual(detecteur.detecter("rue de Lourmel", 7).rues, []);
});

test("Détecteur : pas de station sans mot-clé, ni sur « 35 m² »", async () => {
  const sources = new SourcesLieux(requeteFixe(), stockageMemoire());
  const detecteur = new DetecteurLieux(await sources.voies(), await sources.stations());
  assert.deepEqual(detecteur.detecter("Commerce et Europe à proximité. Surface 35 m² Commerce.").stations, []);
  assert.deepEqual(detecteur.detecter("Métro Commerce (ligne 8)").stations.map((s) => s.nom), ["Commerce"]);
  assert.deepEqual(detecteur.detecter("Proche gare de Lyon").stations.map((s) => s.nom), ["Gare de Lyon"]);
});

testExemple("35 m² sans quartier ni position : la rue Fondary suffit", async (t) => {
  simulerExtension(t);
  const resultat = await depotAvecLieux().localiser(annonceSansQuartier(35, { sansPosition: true }));
  assert.equal(resultat.statut, "estimee");
  assert.deepEqual(resultat.quartiers.map((q) => q.nom), ["Grenelle"]);
  assert.ok(resultat.avertissements.includes("Quartier déduit de : rue Fondary."));
  assert.equal(resultat.position.source, "rue Fondary (milieu de la voie)");
  assert.equal(resultat.position.rayonMetres, 325);
});

testExemple("37 m² sans quartier ni position : rue de Lourmel près de Charles Michels", async (t) => {
  simulerExtension(t);
  const resultat = await depotAvecLieux().localiser(annonceSansQuartier(37, { sansPosition: true }));
  // La station est à la limite des deux quartiers traversés par la rue : pas de choix arbitraire.
  assert.equal(resultat.statut, "ambigue");
  assert.deepEqual(resultat.quartiers.map((q) => q.nom), ["Grenelle", "Javel 15Art"]);
  assert.equal(resultat.position.source, "rue de Lourmel, côté station Charles Michels");
  assert.equal(resultat.position.rayonMetres, 200);
  assert.ok(GeometrieLocale.distanceEntre(resultat.position.point, [2.286, 48.8465]) < 200);
});

testExemple("37 m² avec position : les trois indices concordent sur Javel", async (t) => {
  simulerExtension(t);
  const resultat = await depotAvecLieux().localiser(annonceSansQuartier(37));
  assert.equal(resultat.statut, "estimee");
  assert.deepEqual(resultat.quartiers.map((q) => q.id), [7511560]);
  assert.ok(resultat.avertissements.includes("Quartier déduit de : position approximative de l'annonce, rue de Lourmel et station Charles Michels."));
  assert.deepEqual(resultat.position, { point: [2.28787, 48.8454], rayonMetres: 150, source: "Position de l'annonce" });
  assert.deepEqual(resultat.indices.map((i) => i.type), ["coordonnees", "rue", "station"]);
});

testExemple("Quartier affiché : il prime, mais la position profite des rues et stations", async (t) => {
  simulerExtension(t);
  const indices = annonceSansQuartier(37, { sansPosition: true });
  const resultat = await depotAvecLieux().localiser({ ...indices, quartier: "Javel" });
  assert.equal(resultat.statut, "renseignee");
  assert.equal(resultat.position.source, "rue de Lourmel, côté station Charles Michels");
});

test("Indices contradictoires : signalés, aucun choix arbitraire", () => {
  const resultat = resolveur.resoudre(indices({
    arrondissement: 15, coordonnees: [[2.315, 48.855]], rues: [{ nom: "rue de l'Ouest", quartiers: ["Ouest"] }],
  }));
  assert.equal(resultat.statut, "ambigue");
  assert.deepEqual(resultat.quartiers.map((q) => q.id), [1, 2]);
  assert.ok(resultat.avertissements.some((a) => a.startsWith("Indices contradictoires (position approximative de l'annonce et rue de l'Ouest)")));
});

test("Station : quartiers à moins de 500 m, hors arrondissement ignorés", () => {
  const station = (position) => resolveur.resoudre(indices({ arrondissement: 15, stations: [{ nom: "S", lignes: ["METRO 1"], position }] }));
  assert.deepEqual(station([2.302, 48.855]).quartiers.map((q) => q.id), [1]);
  // ~370 m à l'est de la limite Ouest/Est : les deux quartiers sont possibles ; ~590 m à l'ouest : un seul.
  assert.deepEqual(station([2.315, 48.855]).quartiers.map((q) => q.id), [1, 2]);
  assert.equal(station([2.315, 48.855]).position.source, "Près de la station S");
});

test("Sans aucun indice précis : centre des quartiers possibles, avec un grand rayon", () => {
  const resultat = resolveur.resoudre(indices({ arrondissement: 15 }));
  assert.equal(resultat.position.source, "Centre des quartiers possibles");
  assert.ok(GeometrieLocale.distanceEntre(resultat.position.point, [2.31, 48.855]) < 1);
  assert.ok(resultat.position.rayonMetres > 800);
  assert.equal(resolveur.resoudre(indices()).position, undefined);
});

testExemple("Hors ligne : la localisation continue avec les indices locaux, et le signale", async (t) => {
  simulerExtension(t);
  const resultat = await depotAvecLieux(async () => { throw new TypeError("Failed to fetch"); }).localiser(annonceSansQuartier(37));
  assert.equal(resultat.statut, "estimee");
  assert.deepEqual(resultat.quartiers.map((q) => q.id), [7511560]);
  assert.ok(resultat.avertissements.some((a) => a.includes("non vérifiées")));
});

test("Sources : cache persistant, expiration, et échec non mémorisé", async () => {
  const stockage = stockageMemoire();
  const appels = [];
  let maintenant = 0;
  await new SourcesLieux(requeteFixe(appels), stockage, () => maintenant).voies();
  assert.equal(appels.length, 1);
  assert.ok(appels[0].startsWith("https://opendata.paris.fr/"));
  // Nouvelle popup, même stockage : pas de nouvel appel.
  assert.equal((await new SourcesLieux(requeteFixe(appels), stockage, () => maintenant).voies()).length, 530);
  assert.equal(appels.length, 1);
  maintenant = 31 * 24 * 3600 * 1000;
  await new SourcesLieux(requeteFixe(appels), stockage, () => maintenant).voies();
  assert.equal(appels.length, 2);

  let echec = true;
  const sources = new SourcesLieux(async (url) => echec ? { ok: false } : requeteFixe()(url), stockageMemoire());
  assert.equal(await sources.stations(), null);
  echec = false;
  assert.equal((await sources.stations()).length, 14);
});

test("Noms de quartiers du référentiel des voies : tous reconnus", () => {
  for (const nom of ["Chapelle", "Sainte-Avoye", "Pont de Flandres", "Javel", "Saint-Lambert", "Necker"]) {
    assert.equal(paris.parNom(nom).length, 1, nom);
  }
});

test("Abréviations de voies : pl., fbg, imp. normalisées", () => {
  assert.equal(NormaliseurLieu.normaliser("12 pl. d'Italie"), "12 place d italie");
  assert.equal(NormaliseurLieu.normaliser("Fbg Saint-Antoine"), "faubourg st antoine");
  assert.equal(NormaliseurLieu.normaliser("imp. Delépine"), "impasse delepine");
});
