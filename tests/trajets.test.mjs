import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { build } from "esbuild";
import { ClientPrim } from "../popup/trajets/ClientPrim.ts";
import { Geocodeur } from "../popup/trajets/Geocodeur.ts";
import { fourchette, prochainDepart } from "../popup/trajets/EstimateurTrajet.ts";
import { tempsTrajets } from "../popup/tempsMetro.ts";
import { verifierClePrim } from "../popup/trajets/CleUtilisateur.ts";

// Réponse PRIM réelle (37 m² rue de Lourmel → 5e), allégée : marche 208 s, métro 10, marche 686 s.
const reponsePrim = JSON.parse(readFileSync("tests/fixtures/prim-journey.json", "utf8"));
// Même départ vers Hôtel de Ville : métro 8, correspondance à pied, attente, métro 1.
const reponseCorrespondance = JSON.parse(readFileSync("tests/fixtures/prim-correspondance.json", "utf8"));
const indexPictos = JSON.parse(readFileSync("data/pictos/index.json", "utf8"));
const lieux = JSON.parse(readFileSync("tests/fixtures/lieux-paris15.json", "utf8"));
const fac = { id: "fac", nom: "Fac", adresse: "5 Rue des Fossés Saint-Jacques 75005 Paris", position: [2.3436, 48.8462] };

function primFixe(appels = [], corps = reponsePrim, status = 200) {
  return async (url, init) => {
    appels.push({ url, init });
    return { ok: status === 200, status, json: async () => corps };
  };
}

test("PRIM : durée, marche jusqu'au premier arrêt, lignes et correspondances", async () => {
  const appels = [];
  const itineraire = await new ClientPrim("cle-test", primFixe(appels)).itineraire([2.28787, 48.8454], fac.position, "20261123T083000");
  const { etapes, ...resume } = itineraire;
  assert.deepEqual(resume, { duree: 1634, marcheDepart: 208, marche: 894, correspondances: 0, lignes: ["Métro 10"] });
  assert.deepEqual(etapes, [
    { type: "marche", minutes: 3, correspondance: false, heureDebut: "8:30", heureFin: "8:34" },
    {
      type: "transport", minutes: 12, attente: 0, ligneId: "C01380", mode: "Métro", code: "10",
      couleur: "DC9600", couleurTexte: "000000", direction: "Gare d'Austerlitz",
      depart: "Charles Michels", arrivee: "Cluny - La Sorbonne", arrets: 9, heureDebut: "8:34", heureFin: "8:46",
    },
    { type: "marche", minutes: 11, correspondance: false, heureDebut: "8:46", heureFin: "8:58" },
  ]);
  assert.equal(appels[0].init.headers.apikey, "cle-test");
  assert.match(appels[0].url, /journeys\?from=2\.287870;48\.845400&to=2\.343600;48\.846200&datetime=20261123T083000&count=1$/);
});

test("Étapes : correspondance à pied, attente comptée dans la ligne suivante", async () => {
  const { etapes, correspondances } = await new ClientPrim("cle", primFixe([], reponseCorrespondance)).itineraire([2.28787, 48.8454], [2.3522, 48.8566], "x");
  assert.equal(correspondances, 1);
  assert.deepEqual(etapes.map((e) => e.type === "marche" ? `marche ${e.minutes}${e.correspondance ? " (correspondance)" : ""}`
    : `${e.ligneId} ${e.depart} → ${e.arrivee}, ${e.arrets} arrêts, ${e.minutes} min dont ${e.attente} d'attente, ${e.heureDebut}–${e.heureFin}`), [
    "marche 8",
    "C01378 Félix Faure → Concorde, 6 arrêts, 8 min dont 0 d'attente, 8:40–8:48",
    "marche 3 (correspondance)",
    "C01371 Concorde → Hôtel de Ville, 5 arrêts, 9 min dont 4 d'attente, 8:55–9:00",
    "marche 2",
  ]);
});

test("Étapes : couleurs non hexadécimales et marches très courtes écartées", async () => {
  const corps = { journeys: [{ duration: 700, sections: [
    { type: "street_network", duration: 20 },
    { type: "public_transport", duration: 600, display_informations: { commercial_mode: "Bus", code: "70", color: "red;background:url(x)", text_color: "FFFFFF" }, links: [{ type: "line", id: "line:IDFM:C01111" }] },
    { type: "street_network", duration: 80 },
  ] }] };
  const { etapes } = await new ClientPrim("cle", primFixe([], corps)).itineraire([2.3, 48.85], [2.31, 48.86], "x");
  assert.deepEqual(etapes.map((e) => [e.type, e.minutes, e.couleur, e.couleurTexte]), [
    ["transport", 10, undefined, "FFFFFF"],
    ["marche", 1, undefined, undefined],
  ]);
});

test("Pictogrammes : métro, RER et Transilien présents, avec l'icône de marche", () => {
  for (const id of ["C01371", "C01380", "C01742", "C01727", "C01737"]) {
    assert.ok(indexPictos[id], id);
    assert.match(readFileSync(`data/pictos/${id}.svg`, "utf8"), /<svg/);
  }
  assert.match(readFileSync("data/pictos/marche.svg", "utf8"), /<svg/);
});

test("PRIM : trajet à pied, clé absente ou refusée, aucun itinéraire", async () => {
  const aPied = { journeys: [{ duration: 300, nb_transfers: 0, sections: [{ type: "street_network", mode: "walking", duration: 300 }] }] };
  const itineraire = await new ClientPrim("cle", primFixe([], aPied)).itineraire([2.3, 48.85], [2.301, 48.85], "20261123T083000");
  assert.equal(itineraire.marcheDepart, 300);
  assert.deepEqual(itineraire.lignes, []);
  await assert.rejects(new ClientPrim("", primFixe()).itineraire([2.3, 48.85], fac.position, "x"), /absente/);
  await assert.rejects(new ClientPrim("faux", primFixe([], {}, 401)).itineraire([2.3, 48.85], fac.position, "x"), /refusée/);
  await assert.rejects(new ClientPrim("cle", primFixe([], { journeys: [] })).itineraire([2.3, 48.85], fac.position, "x"), /Aucun itinéraire/);
});

test("Vérification de la clé : valide, refusée, quota, réseau coupé", async () => {
  const verifier = (requete) => verifierClePrim("cle", new ClientPrim("cle", requete), new Date("2026-11-20T19:00:00Z"));
  const appels = [];
  assert.equal(await verifier(primFixe(appels)), "valide");
  assert.match(appels[0].url, /datetime=20261123T083000/);
  // PRIM a accepté la clé, même sans trajet trouvé.
  assert.equal(await verifier(primFixe([], { journeys: [] })), "valide");
  assert.equal(await verifier(primFixe([], {}, 401)), "refusee");
  assert.equal(await verifier(primFixe([], {}, 429)), "quota");
  assert.equal(await verifier(async () => { throw new TypeError("Failed to fetch"); }), "reseau");
  assert.equal(await verifierClePrim("  "), "absente");
});

test("Écart : marge de marche selon le rayon, bornée par la marche de départ", () => {
  const itineraire = { duree: 1634, marcheDepart: 208, marche: 894, correspondances: 0, lignes: ["Métro 10"] };
  // 150 m ≈ 1 min 53 de marche : 25–29 min.
  assert.deepEqual(fourchette(itineraire, 150), { min: 25, max: 29 });
  // 600 m = 7 min 30, mais on ne gagne au plus que les 3 min 28 de marche jusqu'à Charles Michels.
  assert.deepEqual(fourchette(itineraire, 600), { min: 24, max: 35 });
  assert.equal(fourchette(itineraire, 1600), undefined);
});

test("Départ : prochain jour ouvré à 8 h 30, heure de Paris", () => {
  assert.equal(prochainDepart(new Date("2026-11-20T19:00:00Z")), "20261123T083000"); // vendredi 20 h → lundi
  assert.equal(prochainDepart(new Date("2026-11-21T10:00:00Z")), "20261123T083000"); // samedi → lundi
  assert.equal(prochainDepart(new Date("2026-11-23T06:00:00Z")), "20261123T083000"); // lundi 7 h → le jour même
  assert.equal(prochainDepart(new Date("2026-07-01T06:29:00Z")), "20260701T083000"); // heure d'été, 8 h 29
  assert.equal(prochainDepart(new Date("2026-07-01T06:30:00Z")), "20260702T083000"); // 8 h 30 passée → lendemain
});

test("Géocodage : seules les adresses d'Île-de-France sont proposées", async () => {
  const appels = [];
  const feature = (label, postcode, coordinates) => ({ geometry: { coordinates }, properties: { label, postcode } });
  const geocodeur = new Geocodeur(async (url) => {
    appels.push(url);
    return { ok: true, json: async () => ({ features: [
      feature("12 Rue de Lourmel 75015 Paris", "75015", [2.291719, 48.850041]),
      feature("12 Rue de Lourmel 44000 Nantes", "44000", [-1.5429, 47.2159]),
      feature("Adresse invalide", "92100", ["x", 48.8]),
    ] }) };
  });
  assert.deepEqual(await geocodeur.suggerer("12 rue de lourmel"), [{ label: "12 Rue de Lourmel 75015 Paris", position: [2.291719, 48.850041] }]);
  assert.match(appels[0], /search\?q=12%20rue%20de%20lourmel&limit=8$/);
  assert.deepEqual(await geocodeur.suggerer("12"), []);
  assert.equal(appels.length, 1);
});

test("Trajets : fourchette par lieu, échec isolé, position trop imprécise", async () => {
  const position = { point: [2.28787, 48.8454], rayonMetres: 150, source: "Position de l'annonce" };
  const client = new ClientPrim("cle", async (url) => url.includes("to=2.000000")
    ? { ok: false, status: 500, json: async () => ({}) }
    : { ok: true, status: 200, json: async () => reponsePrim });
  const loin = { id: "loin", nom: "Loin", adresse: "?", position: [2, 48.8] };
  const [versFac, versLoin] = await tempsTrajets(position, [fac, loin], client, new Date("2026-11-20T19:00:00Z"));
  assert.equal(versFac.minMinutes, 25);
  assert.equal(versFac.maxMinutes, 29);
  assert.equal(versLoin.erreur, "Aucun itinéraire trouvé");
  const vague = await tempsTrajets({ ...position, rayonMetres: 2500 }, [fac], client);
  assert.equal(vague[0].erreur, "Position du logement trop imprécise");
});

// --- Popup complète ---

function exemple(surface) {
  const nom = readdirSync("exemplesJinka").find((n) => n.endsWith(".html") && n.includes(`${surface} m²`));
  const html = readFileSync(`exemplesJinka/${nom}`, "utf8");
  return new JSDOM(html, { url: html.match(/saved from url=\(\d+\)(https:\/\/[^\s]+)/)[1] });
}
const geojson = JSON.parse(readFileSync("data/logement-encadrement-des-loyers.geojson", "utf8"));
const baremes = geojson.features.map((f) => f.properties);
const quartiersParis = [...new Map(geojson.features.map(({ properties: p, geometry }) => [p.code_grand_quartier, {
  id: p.code_grand_quartier, nom: p.nom_quartier, arrondissement: Math.floor(p.code_grand_quartier / 100) % 100, geometrie: geometry,
}])).values()];

// La clé PRIM vient du stockage local de l'extension, saisie par l'utilisateur dans les options.
async function ouvrirPopup(lieuxEnregistres, appelsPrim = [], { cle = "cle-popup", statutPrim = 200 } = {}) {
  const { JinkaParseur } = await import("../popup/jinkaParseur.ts");
  const annonce = exemple(37);
  const logement = new JinkaParseur().parser(annonce.window.document);
  annonce.window.close();
  const popup = new JSDOM('<div id="resultat"></div><div id="details"></div><div id="trajets"></div>', { runScripts: "outside-only" });
  const { window } = popup;
  const options = [];
  window.chrome = {
    runtime: { getURL: (p) => `chrome-extension://test/${p}`, openOptionsPage: () => options.push(true) },
    tabs: { query: async () => [{ id: 1 }], sendMessage: async () => ({ logement }) },
    storage: {
      sync: { get: async () => ({ lieux: lieuxEnregistres }) },
      local: { get: async (k) => k === "clePrim" && cle ? { clePrim: cle } : {}, set: async () => {} },
    },
  };
  window.fetch = async (url, init) => {
    if (url.startsWith("chrome-extension://test/data/")) {
      const corps = url.endsWith("encadrement.json") ? baremes : url.endsWith("pictos/index.json") ? indexPictos : quartiersParis;
      return { ok: true, json: async () => corps };
    }
    if (url.includes("prim.iledefrance-mobilites.fr")) {
      appelsPrim.push({ url, init });
      return { ok: statutPrim === 200, status: statutPrim, json: async () => statutPrim === 200 ? reponsePrim : {} };
    }
    const u = decodeURIComponent(url);
    const corps = u.includes("emplacement-des-gares") ? lieux.gares
      : u.includes("geo_shape") ? lieux.traces[u.match(/typo_min="([^"]+)"/)[1]] ?? [] : lieux.voies;
    return { ok: true, json: async () => corps };
  };
  const compilation = await build({ entryPoints: ["popup/popup.ts"], bundle: true, write: false, format: "iife" });
  window.eval(compilation.outputFiles[0].text);
  const trajets = window.document.getElementById("trajets");
  for (let i = 0; i < 50 && !/ min|Configurer|Ajouter ma clé|Vérifier ma clé/.test(trajets.textContent); i++) {
    await new Promise((r) => setTimeout(r, 10));
  }
  return { window, trajets, options };
}

test("Popup : sans lieu ni clé, invitation à configurer", async () => {
  const { window, trajets, options } = await ouvrirPopup(undefined, [], { cle: "" });
  assert.match(trajets.textContent, /Configurer/);
  assert.match(trajets.textContent, /ta clé PRIM gratuite/);
  trajets.querySelector("[data-options]").click();
  assert.equal(options.length, 1);
  window.close();
});

test("Popup : lieux sans clé, aucun appel PRIM et lien vers les options", async () => {
  const appels = [];
  const { window, trajets } = await ouvrirPopup([fac], appels, { cle: "" });
  assert.match(trajets.textContent, /Ajouter ma clé/);
  assert.equal(appels.length, 0);
  window.close();
});

test("Popup : clé refusée, un seul message au lieu d'une erreur par lieu", async () => {
  const { window, trajets } = await ouvrirPopup([fac, { ...fac, id: "b", nom: "Travail" }], [], { statutPrim: 401 });
  assert.match(trajets.textContent, /Vérifier ma clé/);
  assert.doesNotMatch(trajets.textContent, /Travail/);
  window.close();
});

test("Popup : temps vers chaque lieu, avec la clé de l'utilisateur et le texte échappé", async () => {
  const appels = [];
  const { window, trajets } = await ouvrirPopup([{ ...fac, nom: 'Fac <img src=x onerror="alert(1)">' }], appels);
  assert.match(trajets.textContent, /25–29 min/);
  assert.match(trajets.textContent, /Direct/);
  // Étapes façon Citymapper : marche 3 min › métro 10 12 min › marche 11 min.
  const etapes = [...trajets.querySelectorAll(".etape")];
  assert.deepEqual(etapes.map((e) => e.textContent), ["3", "12", "11"]);
  assert.ok(etapes[0].querySelector(".icone-marche"));
  assert.equal(etapes[1].querySelector("img.picto").getAttribute("src"), "../data/pictos/C01380.svg");
  assert.equal(etapes[1].querySelector("img.picto").alt, "Métro 10");
  assert.equal(trajets.querySelectorAll(".fleche").length, 2);
  // Itinéraire vertical déplié pour le premier lieu : départ, stations, arrivée, avec les heures.
  assert.ok(trajets.querySelector("details.trajet").open);
  assert.deepEqual([...trajets.querySelectorAll(".arret")].map((a) => a.textContent),
    ["8:30Départ", "8:34Charles Michels", "8:46Cluny - La Sorbonne", "8:58Fac <img src=x onerror=\"alert(1)\">"]);
  assert.match(trajets.querySelector(".troncon.transport").textContent, /Direction Gare d'Austerlitz9 arrêts · 12 min/);
  assert.equal(trajets.querySelector(".troncon.transport").style.getPropertyValue("--ligne"), "#DC9600");
  assert.match(trajets.textContent, /depuis Position de l'annonce \(à 150 m près\)/);
  assert.match(trajets.textContent, /<img src=x/);
  assert.equal([...window.document.querySelectorAll("img")].filter((i) => !i.classList.contains("picto")).length, 0);
  assert.equal(appels[0].init.headers.apikey, "cle-popup");
  // Le verdict est resté affiché.
  assert.match(window.document.getElementById("resultat").textContent, /1990/);
  window.close();
});
