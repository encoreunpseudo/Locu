import { estDansEncadrementData, type FourchetteEncadrement, type Logement } from "./checkEncadrementLoyers";
import type { PositionEstimee } from "./localisation";
import { lireLieux, tempsTrajets, type TempsTrajet } from "./tempsMetro";
import type { Etape } from "./trajets/types";

const resultatEl = document.getElementById("resultat")!;
const detailsEl = document.getElementById("details")!;
const trajetsEl = document.getElementById("trajets");

const NOMS_CHAMPS: Record<string, string> = {
  quartier: "quartier",
  pieces: "nombre de pièces",
  epoque: "époque de construction",
  meuble: "meublé / non meublé",
};

const ICONES: Record<string, string> = { ok: "✓", depasse: "✕", incertain: "?", inconnu: "i" };

function afficher(classe: string, titre: string, details = "", sousTitre = "") {
  resultatEl.className = `resultat ${classe}`;
  resultatEl.innerHTML = `<span class="icone">${ICONES[classe] ?? "i"}</span><div><div class="titre">${echapper(titre)}</div>${
    sousTitre ? `<div class="sous-titre">${echapper(sousTitre)}</div>` : ""}</div>`;
  detailsEl.innerHTML = details;
}

const euros = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + "\u00a0€";
const echapper = (texte: string) => texte.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const ORDRE_EPOQUES = ["Avant 1946", "1946-1970", "1971-1990", "Apres 1990"];
const NOMS_EPOQUES: Record<string, string> = {
  "Avant 1946": "avant 1946", "1946-1970": "entre 1946 et 1970",
  "1971-1990": "entre 1971 et 1990", "Apres 1990": "après 1990",
};
const LIBELLES_EPOQUES: Record<string, string> = {
  "Avant 1946": "Avant 1946", "1946-1970": "1946 – 1970", "1971-1990": "1971 – 1990", "Apres 1990": "Après 1990",
};

// Le barème d'une année s'applique aux baux signés du 1er juillet au 30 juin suivant.
function baremePerime(annee: string): boolean {
  return new Date() >= new Date(Number(annee) + 1, 6, 1);
}

const ecart = (n: number) => `${n > 0 ? "+" : "−"}${euros(Math.abs(Math.round(n)))}`;

function afficherFourchette(logement: Logement, f: FourchetteEncadrement) {
  const surface = logement.nbM2;
  const prix = f.prixM2 != null ? logement.prixMois! : null;
  const mensuel = (m2: number) => surface ? m2 * surface : null;
  const epoques = [...f.parEpoque].sort((a, b) => ORDRE_EPOQUES.indexOf(a.epoque) - ORDRE_EPOQUES.indexOf(b.epoque));
  const autresManquants = f.champsManquants.filter((c) => c !== "epoque" && c !== "quartier");

  // Pastilles : ce que l'extension a lu dans l'annonce
  const arrondissement = f.arrondissement === 1 ? "1er" : `${f.arrondissement}e`;
  const lieu = f.quartier ? `${f.quartier.replace(/ \d+Art$/, "")} · ${arrondissement}` : `Paris ${arrondissement}`;
  const pastilles = [
    lieu,
    logement.pieces != null ? `${logement.pieces} pièce${logement.pieces > 1 ? "s" : ""}` : "pièces ?",
    surface != null ? `${surface} m²` : "surface ?",
    logement.meuble == null ? "meublé ?" : logement.meuble ? "Meublé" : "Non meublé",
  ];
  let html = `<div class="pastilles">${pastilles.map((p) => `<span>${echapper(p)}</span>`).join("")}</div>`;

  // Loyer face au plafond
  const plafondAffiche = mensuel(f.max);
  html += `<div class="chiffres">
    <div><div class="etiquette">${f.chargesInconnues ? "Prix affiché" : "Loyer hors charges"}</div>
      <div class="valeur">${prix != null ? euros(prix) : "—"}</div>
      <div class="unite">${f.prixM2 != null ? `${euros(f.prixM2)} /m²` : "loyer introuvable"}</div></div>
    <div><div class="etiquette">${epoques.length > 1 ? "Plafond max" : "Plafond légal"}</div>
      <div class="valeur">${plafondAffiche != null ? euros(Math.round(plafondAffiche)) : `${euros(f.max)} /m²`}</div>
      <div class="unite">${euros(f.max)} /m²</div></div>
  </div>`;

  // Détail par époque, seulement si elle est inconnue
  if (epoques.length > 1) {
    const rangees = epoques.map((e) => {
      const plafond = mensuel(e.max);
      const difference = prix != null && plafond != null ? prix - plafond : null;
      const badge = e.depasse == null || difference == null ? '<span class="badge neutre">?</span>'
        : `<span class="badge ${e.depasse ? "rouge" : "vert"}">${ecart(difference)}</span>`;
      return `<div class="rangee"><span>${LIBELLES_EPOQUES[e.epoque]}</span><span class="montant">${
        plafond != null ? euros(Math.round(plafond)) : `${euros(e.max)} /m²`}</span>${badge}</div>`;
    }).join("");
    html += `<div class="section"><div class="etiquette">Plafond selon l'année de construction</div>${rangees}</div>`;
  }

  // Remarques : hypothèses en premier, puis limites des données
  const remarques: { classe: string; texte: string }[] = [];
  if (f.chargesInconnues) remarques.push({ classe: "hypothese", texte: "Charges non indiquées : le prix affiché est considéré comme hors charges." });
  if (f.localisation.quartiers.length > 1) {
    const noms = f.localisation.quartiers.slice(0, 8).map((q) => q.nom).join(", ");
    remarques.push({ classe: "hypothese", texte: `Quartier non déterminé, quartiers possibles : ${noms}${f.localisation.quartiers.length > 8 ? "…" : ""}.` });
  }
  for (const avertissement of f.localisation.avertissements) remarques.push({ classe: "hypothese", texte: avertissement });
  if (autresManquants.length) remarques.push({ classe: "info", texte: `Inconnu dans l'annonce : ${autresManquants.map((c) => NOMS_CHAMPS[c]).join(", ")}.` });
  if (baremePerime(f.annee)) {
    remarques.push({ classe: "info", texte: `Barème ${f.annee} périmé : un barème plus récent s'applique aux baux signés depuis le 1er juillet ${Number(f.annee) + 1}.` });
  } else {
    remarques.push({ classe: "info", texte: `Barème ${f.annee}.` });
  }
  html += remarques.map((r) => `<div class="remarque ${r.classe}">${echapper(r.texte)}</div>`).join("");

  // Les indices bruts n'intéressent que pour comprendre la localisation : repliés par défaut.
  const technique = f.localisation.indices
    .map((i) => `${i.source} : ${i.libelle}${i.quartiers.length ? "" : " (non reconnu)"}`);
  const position = f.localisation.position;
  if (position) technique.push(`Position estimée : ${position.source} (à ${position.rayonMetres} m près)`);
  if (technique.length) {
    html += `<details><summary>Détails de localisation</summary><ul>${technique.map((t) => `<li>${echapper(t)}</li>`).join("")}</ul></details>`;
  }

  // Si seule l'époque manque, la réponse utile est « dépasse sauf si construit … ».
  const conformes = epoques.filter((e) => e.depasse === false).map((e) => NOMS_EPOQUES[e.epoque]);
  const conditionnel = f.verdict === "indetermine" && autresManquants.length === 0 &&
    f.localisation.quartiers.length === 1 && epoques.every((e) => e.depasse != null);
  const depassement = prix != null && plafondAffiche != null ? prix - plafondAffiche : null;
  const marge = prix != null && surface ? f.plafondMin * surface - prix : null;

  if (f.verdict === "inconnu") {
    afficher("inconnu", "Loyer ou surface introuvable dans l'annonce", html);
  } else if (f.verdict === "depasse" && f.chargesMin != null) {
    // Le seuil dépend de l'époque quand elle est inconnue : donner la fourchette plutôt que le cas le plus favorable.
    const seuils = epoques.map((e) => e.chargesMin).filter((c): c is number => c != null);
    const pire = Math.max(...seuils);
    afficher("depasse", "Au-dessus du plafond", html, epoques.length > 1 && pire > f.chargesMin
      ? `Sauf si les charges sont d'au moins ${euros(f.chargesMin)} à ${euros(pire)} /mois selon l'année de construction`
      : `Sauf si les charges sont d'au moins ${euros(f.chargesMin)} /mois`);
  } else if (f.verdict === "depasse") {
    afficher("depasse", "Au-dessus du plafond", html, depassement != null
      ? `${epoques.length > 1 ? "Au moins " : ""}${euros(Math.round(depassement))} /mois de trop` : "");
  } else if (conditionnel) {
    afficher("depasse", "Au-dessus du plafond", html, `Sauf si l'immeuble a été construit ${conformes.join(" ou ")}`);
  } else if (f.verdict === "indetermine") {
    afficher("incertain", "Résultat indéterminé", html, "L'annonce ne donne pas assez de précisions pour conclure");
  } else {
    afficher("ok", "Dans l'encadrement des loyers", html, marge != null && marge > 0
      ? `${euros(Math.round(marge))} /mois sous le plafond` : "");
  }
}

async function verifierOngletActif() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let logement: Logement | null;
  try {
    ({ logement } = await chrome.tabs.sendMessage(tab.id!, { type: "PARSER_ANNONCE" }));
  } catch {
    // Content script absent : page chrome:// ou onglet ouvert avant l'installation
    afficher("inconnu", "Recharge la page de l'annonce puis réessaie.");
    return;
  }
  if (!logement) {
    afficher("inconnu", "Ouvre une annonce Jinka pour la vérifier.");
    return;
  }

  const fourchette = await estDansEncadrementData(logement);
  if (!fourchette) {
    afficher("inconnu", "Localisation ou barème insuffisant pour effectuer la vérification.");
    return;
  }
  afficherFourchette(logement, fourchette);
  // Les trajets arrivent ensuite, sans retarder le verdict.
  // Un échec des trajets ne doit jamais remplacer le verdict déjà affiché.
  await afficherTrajets(fourchette.localisation.position).catch(() => { if (trajetsEl) trajetsEl.innerHTML = ""; });
}

// Temps en transports en commun vers les lieux enregistrés dans les options.
async function afficherTrajets(position?: PositionEstimee) {
  if (!trajetsEl) return;
  const entete = (lien: string) => `<div class="entete-trajets"><span class="etiquette">Trajets</span>` +
    `<button class="lien" data-options>${echapper(lien)}</button></div>`;
  const lieux = await lireLieux();
  if (!lieux.length) {
    trajetsEl.innerHTML = `<div class="section trajets">${entete("Ajouter mes lieux")}` +
      `<div class="contexte">Enregistre ton travail ou ta fac pour voir le temps de trajet depuis chaque annonce.</div></div>`;
  } else if (!position) {
    trajetsEl.innerHTML = `<div class="section trajets">${entete("Mes lieux")}<div class="contexte">Position du logement inconnue.</div></div>`;
  } else {
    trajetsEl.innerHTML = `<div class="section trajets">${entete("Mes lieux")}<div class="contexte">Calcul des trajets…</div></div>`;
    const [temps, pictos] = await Promise.all([tempsTrajets(position, lieux), pictogrammesDisponibles()]);
    const contexte = `En semaine, départ 8 h 30 · depuis ${position.source} (à ${position.rayonMetres} m près)`;
    trajetsEl.innerHTML = `<div class="section trajets">${entete("Mes lieux")}${temps.map((t, i) => ligneTrajet(t, pictos, i === 0)).join("")}` +
      `<div class="contexte">${echapper(contexte)}</div></div>`;
  }
  trajetsEl.querySelector("[data-options]")?.addEventListener("click", () => chrome.runtime.openOptionsPage());
}

function ligneTrajet(t: TempsTrajet, pictos: Set<string>, ouvert: boolean): string {
  if (t.minMinutes == null || t.maxMinutes == null || !t.itineraire) {
    return `<div class="rangee trajet"><span>${echapper(t.lieu.nom)}</span><span class="detail-trajet erreur">${echapper(t.erreur ?? "Indisponible")}</span></div>`;
  }
  const duree = t.minMinutes === t.maxMinutes ? `${t.minMinutes} min` : `${t.minMinutes}–${t.maxMinutes} min`;
  const { lignes, correspondances, etapes } = t.itineraire;
  const detail = !lignes.length ? "À pied"
    : correspondances === 0 ? "Direct" : `${correspondances} correspondance${correspondances > 1 ? "s" : ""}`;
  const resume = `<span><span class="nom-lieu">${echapper(t.lieu.nom)}</span><span class="detail-trajet">${echapper(detail)}</span></span>` +
    `<span class="duree">${echapper(duree)}</span>`;
  if (!etapes?.length) return `<div class="rangee trajet">${resume}</div>`;
  // Résumé horizontal toujours visible ; un clic déplie l'itinéraire station par station.
  return `<details class="trajet"${ouvert ? " open" : ""}><summary class="resume-trajet">${resume}` +
    `<div class="etapes">${etapesHtml(etapes, pictos)}<span class="chevron" aria-hidden="true"></span></div></summary>` +
    `${itineraireHtml(etapes, t.lieu.nom, pictos)}</details>`;
}

function iconeLigne(e: Extract<Etape, { type: "transport" }>, pictos: Set<string>): string {
  const nom = `${e.mode} ${e.code}`.trim();
  return e.ligneId && pictos.has(e.ligneId)
    ? `<img class="picto" src="../data/pictos/${e.ligneId}.svg" alt="${echapper(nom)}">`
    : `<span class="badge-ligne" style="${e.couleur ? `background:#${e.couleur};` : ""}${e.couleurTexte ? `color:#${e.couleurTexte};` : ""}" aria-label="${echapper(nom)}">${echapper(e.code || e.mode)}</span>`;
}

const ICONE_MARCHE = `<span class="icone-marche" role="img" aria-label="À pied"></span>`;

// « 🚶 3 › Ⓜ10 12 › 🚶 11 », comme Citymapper : une icône par étape suivie de sa durée en minutes.
function etapesHtml(etapes: Etape[], pictos: Set<string>): string {
  return etapes.map((e) => {
    if (e.type === "marche") return `<span class="etape" title="${e.minutes} min à pied">${ICONE_MARCHE}${e.minutes}</span>`;
    const titre = `${e.mode} ${e.code}${e.direction ? ` direction ${e.direction}` : ""}, ${e.minutes} min`;
    return `<span class="etape" title="${echapper(titre)}">${iconeLigne(e, pictos)}${e.minutes}</span>`;
  }).join(`<span class="fleche" aria-hidden="true">›</span>`);
}

/**
 * Frise verticale : un point par lieu (départ, stations, arrivée) avec son heure,
 * et entre deux points le tronçon parcouru (pointillés à pied, trait à la couleur de la ligne).
 */
function itineraireHtml(etapes: Etape[], destination: string, pictos: Set<string>): string {
  const arret = (heure: string | undefined, nom: string, extremite = false) =>
    `<li class="arret${extremite ? " extremite" : ""}"><span class="heure">${echapper(heure ?? "")}</span>` +
    `<span class="rail"><span class="point"></span></span><span class="nom-arret">${echapper(nom)}</span></li>`;
  const troncon = (e: Etape) => {
    if (e.type === "marche") {
      return `<li class="troncon marche"><span class="heure"></span><span class="rail"></span><span class="texte">` +
        `${ICONE_MARCHE}${e.correspondance ? "Correspondance à pied" : "À pied"} · ${e.minutes} min</span></li>`;
    }
    const sousTitre = [
      e.arrets != null ? `${e.arrets} arrêt${e.arrets > 1 ? "s" : ""}` : "",
      `${e.minutes - e.attente} min`,
      e.attente ? `attente ${e.attente} min` : "",
    ].filter(Boolean).join(" · ");
    return `<li class="troncon transport"${e.couleur ? ` style="--ligne:#${e.couleur}"` : ""}><span class="heure"></span><span class="rail"></span>` +
      `<span class="texte"><span class="ligne-titre">${iconeLigne(e, pictos)}<span>${echapper(e.direction ? `Direction ${e.direction}` : `${e.mode} ${e.code}`)}</span></span>` +
      `<span class="sous">${echapper(sousTitre)}</span></span></li>`;
  };

  const rangs = [arret(etapes[0].heureDebut, "Départ", true)];
  etapes.forEach((e, i) => {
    rangs.push(troncon(e));
    const suivante = etapes[i + 1];
    if (!suivante) return;
    // Station entre deux tronçons : celle où l'on monte, sinon celle où l'on descend.
    const nom = suivante.type === "transport" ? suivante.depart : e.type === "transport" ? e.arrivee : undefined;
    rangs.push(arret(suivante.type === "transport" ? suivante.heureDebut : e.heureFin, nom ?? ""));
  });
  rangs.push(arret(etapes[etapes.length - 1].heureFin, destination, true));
  return `<ol class="itineraire">${rangs.join("")}</ol>`;
}

// Pictogrammes IDFM empaquetés (data/pictos/index.json) ; sans eux, des badges colorés les remplacent.
let pictosCache: Promise<Set<string>> | undefined;
function pictogrammesDisponibles(): Promise<Set<string>> {
  pictosCache ??= fetch(chrome.runtime.getURL("data/pictos/index.json"))
    .then((r) => r.ok ? r.json() : {})
    .then((index) => new Set(Object.keys(index ?? {})))
    .catch(() => new Set());
  return pictosCache;
}

verifierOngletActif().catch(() => afficher("inconnu", "Impossible de lire les données locales. Recharge l'extension puis réessaie."));
