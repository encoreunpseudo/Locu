import { estDansEncadrementData, type FourchetteEncadrement, type Logement } from "./checkEncadrementLoyers";

const resultatEl = document.getElementById("resultat")!;
const detailsEl = document.getElementById("details")!;

const NOMS_CHAMPS: Record<string, string> = {
  quartier: "quartier",
  pieces: "nombre de pièces",
  epoque: "époque de construction",
  meuble: "meublé / non meublé",
};

function afficher(classe: string, titre: string, details = "") {
  resultatEl.className = `resultat ${classe}`;
  resultatEl.textContent = titre;
  detailsEl.innerHTML = details;
}

const euros = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " €";
const echapper = (texte: string) => texte.replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const ORDRE_EPOQUES = ["Avant 1946", "1946-1970", "1971-1990", "Apres 1990"];
const NOMS_EPOQUES: Record<string, string> = {
  "Avant 1946": "avant 1946", "1946-1970": "entre 1946 et 1970",
  "1971-1990": "entre 1971 et 1990", "Apres 1990": "après 1990",
};

// Le barème d'une année s'applique aux baux signés du 1er juillet au 30 juin suivant.
function baremePerime(annee: string): boolean {
  return new Date() >= new Date(Number(annee) + 1, 6, 1);
}

function afficherFourchette(logement: Logement, f: FourchetteEncadrement) {
  const lieu = f.quartier ?? `${f.localisation.quartiers.length} quartiers possibles`;
  const surface = logement.nbM2;
  const parMois = (m2: number) => surface ? `${euros(Math.round(m2 * surface))} /mois` : `${euros(m2)} /m²`;
  const lignes = [
    `<li>${echapper(lieu)} · ${logement.pieces ?? "?"} pièce(s) · ${surface ?? "?"} m² · ${
      logement.meuble == null ? "meublé ?" : logement.meuble ? "meublé" : "non meublé"
    }</li>`,
  ];
  if (f.prixM2 != null && f.chargesInconnues) {
    lignes.push(`<li>Annonce : <strong>${euros(logement.prixMois!)} /mois</strong> (${euros(f.prixM2)} /m²)</li>`);
    lignes.push('<li class="hypothese">Charges non indiquées : le prix affiché est considéré comme hors charges.</li>');
  } else if (f.prixM2 != null) {
    lignes.push(`<li>Annonce : <strong>${euros(logement.prixMois!)} /mois</strong> hors charges (${euros(f.prixM2)} /m²)</li>`);
  }

  const epoques = [...f.parEpoque].sort((a, b) => ORDRE_EPOQUES.indexOf(a.epoque) - ORDRE_EPOQUES.indexOf(b.epoque));
  if (epoques.length > 1) {
    const rangees = epoques.map((e) => `<tr><td>${NOMS_EPOQUES[e.epoque]}</td><td>${parMois(e.max)}</td><td>${
      e.depasse == null ? "?" : !e.depasse ? "✅" : e.chargesMin != null ? `❌ sauf charges ≥ ${euros(e.chargesMin)}` : "❌"}</td></tr>`).join("");
    lignes.push(`<li>Plafond selon l'année de construction (barème ${echapper(f.annee)}) :<table>${rangees}</table></li>`);
  } else {
    lignes.push(`<li>Plafond (barème ${echapper(f.annee)}) : <strong>${parMois(f.max)}</strong></li>`);
  }
  if (f.localisation.quartiers.length > 1) {
    const noms = f.localisation.quartiers.slice(0, 8).map((q) => echapper(q.nom)).join(", ");
    lignes.push(`<li class="manquants">Quartier non déterminé, quartiers possibles : ${noms}${f.localisation.quartiers.length > 8 ? "…" : ""}.</li>`);
  }
  const autresManquants = f.champsManquants.filter((c) => c !== "epoque" && c !== "quartier");
  if (autresManquants.length) lignes.push(`<li class="manquants">Inconnu dans l'annonce : ${autresManquants.map((c) => NOMS_CHAMPS[c]).join(", ")}.</li>`);
  if (baremePerime(f.annee)) {
    lignes.push(`<li class="manquants">Barème ${echapper(f.annee)} périmé : un barème plus récent s'applique aux baux signés depuis le 1er juillet ${Number(f.annee) + 1}.</li>`);
  }

  for (const avertissement of f.localisation.avertissements) lignes.push(`<li class="manquants">${echapper(avertissement)}</li>`);

  // Les indices bruts n'intéressent que pour comprendre la localisation : repliés par défaut.
  const technique = f.localisation.indices
    .map((i) => `${i.source} : ${i.libelle}${i.quartiers.length ? "" : " (non reconnu)"}`);
  const details = `<ul>${lignes.join("")}</ul>` + (technique.length
    ? `<details><summary>Détails de localisation</summary><ul>${technique.map((t) => `<li>${echapper(t)}</li>`).join("")}</ul></details>`
    : "");

  // Si seule l'époque manque, la réponse utile est « dépasse sauf si construit … ».
  const conformes = epoques.filter((e) => e.depasse === false).map((e) => NOMS_EPOQUES[e.epoque]);
  const conditionnel = f.verdict === "indetermine" && autresManquants.length === 0 &&
    f.localisation.quartiers.length === 1 && epoques.every((e) => e.depasse != null);

  if (f.verdict === "inconnu") {
    afficher("inconnu", "Loyer hors charges ou surface introuvable", details);
  } else if (f.verdict === "depasse" && f.chargesMin != null) {
    // Le seuil dépend de l'époque quand elle est inconnue : donner la fourchette plutôt que le cas le plus favorable.
    const seuils = epoques.map((e) => e.chargesMin).filter((c): c is number => c != null);
    const pire = Math.max(...seuils);
    afficher("depasse", epoques.length > 1 && pire > f.chargesMin
      ? `Au-dessus du plafond, sauf si les charges sont d'au moins ${euros(f.chargesMin)} à ${euros(pire)} /mois selon l'année de construction`
      : `Au-dessus du plafond, sauf si les charges sont d'au moins ${euros(f.chargesMin)} /mois`, details);
  } else if (f.verdict === "depasse") {
    afficher("depasse", "Au-dessus du plafond légal", details);
  } else if (conditionnel) {
    afficher("depasse", `Au-dessus du plafond, sauf si l'immeuble a été construit ${conformes.join(" ou ")}`, details);
  } else if (f.verdict === "indetermine") {
    afficher("incertain", "Résultat indéterminé : des précisions sont nécessaires", details);
  } else {
    afficher("ok", "Dans l'encadrement des loyers", details);
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
}

verifierOngletActif().catch(() => afficher("inconnu", "Impossible de lire les données locales. Recharge l'extension puis réessaie."));
