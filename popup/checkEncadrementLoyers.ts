import { DepotLocalisation, NormaliseurLieu, type IndicesLocalisation, type ResultatLocalisation } from "./localisation";

export type Epoque = "Avant 1946" | "1946-1970" | "1971-1990" | "Apres 1990";

// Propriétés du geojson gardées par build.mjs dans data/encadrement.json
export interface LigneEncadrement {
  annee: string;
  nom_quartier: string;
  piece: 1 | 2 | 3 | 4;
  epoque: Epoque;
  meuble_txt: "meublé" | "non meublé";
  ref: number;
  max: number;
  min: number;
  code_grand_quartier: number;
}

export interface Logement {
  quartier?: string;
  arrondissement?: number | string;
  pieces?: number;
  epoque?: Epoque;
  meuble?: boolean;
  annee?: number | string;
  prixMois?: number;
  // Vrai si prixMois est le prix affiché, faute de montant de charges dans l'annonce
  chargesInconnues?: boolean;
  nbM2?: number;
  indicesLocalisation?: IndicesLocalisation;
}

// Fourchette en €/m²/mois
export interface FourchetteEncadrement {
  quartier: string | null;
  arrondissement: number;
  annee: string;
  min: number;
  ref: number | null;
  max: number;
  // Bornes des plafonds majorés possibles, distinctes du loyer minoré `min`.
  plafondMin: number;
  verdict: "inconnu" | "depasse" | "sous_plafonds" | "indetermine";
  localisation: ResultatLocalisation;
  // Renseignés seulement si prixMois et nbM2 sont connus
  prixM2: number | null;
  loyerMaxMois: number | null;
  depasse: boolean | null;
  // Critères absents du logement : la fourchette prend alors le pire cas sur ces critères
  champsManquants: ChampCritere[];
  nbChampsManquants: number;
  // Plafond le plus favorable au bailleur pour chaque époque possible (€/m²)
  // chargesMin : charges mensuelles qu'il faudrait pour passer sous ce plafond (charges inconnues)
  parEpoque: { epoque: Epoque; max: number; depasse: boolean | null; chargesMin: number | null }[];
  chargesInconnues: boolean;
  // Charges qu'il faudrait pour passer sous le plafond le plus élevé (charges inconnues)
  chargesMin: number | null;
}

type ChampCritere = "quartier" | "pieces" | "epoque" | "meuble";

let encadrementCache: LigneEncadrement[] | null = null;
const depotLocalisation = new DepotLocalisation();

// Version allégée du geojson (sans les polygones), générée par build.mjs
async function chargerEncadrement(): Promise<LigneEncadrement[]> {
  if (!encadrementCache) {
    const reponse = await fetch(chrome.runtime.getURL("data/encadrement.json"));
    if (!reponse.ok) throw new Error("Barème local indisponible");
    encadrementCache = await reponse.json();
  }
  return encadrementCache!;
}

// code_grand_quartier 7511143 -> arrondissement 11
function arrondissementDeLigne(l: LigneEncadrement): number {
  return Math.floor(l.code_grand_quartier / 100) % 100;
}

// L'accès aux fichiers reste séparé du calcul pur pour permettre les tests hors navigateur.
export async function estDansEncadrementData(logement: Logement): Promise<FourchetteEncadrement | null> {
  const indices = logement.indicesLocalisation ?? {
    quartier: logement.quartier,
    arrondissement: NormaliseurLieu.arrondissement(logement.arrondissement),
    coordonnees: [],
  };
  const [lignes, localisation] = await Promise.all([chargerEncadrement(), depotLocalisation.localiser(indices)]);
  return calculerEncadrement(logement, lignes, localisation);
}

export function calculerEncadrement(
  logement: Logement, lignes: LigneEncadrement[], localisation: ResultatLocalisation,
): FourchetteEncadrement | null {
  const ids = new Set(localisation.quartiers.map((q) => q.id));
  const duQuartier = lignes.filter((l) => ids.has(l.code_grand_quartier));
  if (duQuartier.length === 0) return null;

  const annee = String(logement.annee ?? Math.max(...duQuartier.map((l) => Number(l.annee))));
  const pieces = logement.pieces != null ? Math.min(logement.pieces, 4) : null;

  const correspondances = duQuartier.filter(
    (l) =>
      l.annee === annee &&
      (pieces == null || l.piece === pieces) &&
      (logement.epoque == null || l.epoque === logement.epoque) &&
      (logement.meuble == null || (l.meuble_txt === "meublé") === logement.meuble)
  );
  if (correspondances.length === 0) return null;
  // Une couverture partielle ne permet pas de conclure sur tous les quartiers candidats.
  if (new Set(correspondances.map((l) => l.code_grand_quartier)).size !== ids.size) return null;

  const max = Math.max(...correspondances.map((l) => l.max));
  const plafondMin = Math.min(...correspondances.map((l) => l.max));
  const champsManquants = (["quartier", "pieces", "epoque", "meuble"] as const).filter((c) =>
    c === "quartier" ? localisation.statut !== "renseignee" : logement[c] == null
  );
  const surfaceValide = logement.nbM2 != null && Number.isFinite(logement.nbM2) && logement.nbM2 > 0;
  const prixM2 = logement.prixMois != null && Number.isFinite(logement.prixMois) && logement.prixMois >= 0 && surfaceValide
    ? logement.prixMois / logement.nbM2! : null;
  const verdict = prixM2 == null ? "inconnu" : prixM2 > max ? "depasse" : prixM2 <= plafondMin ? "sous_plafonds" : "indetermine";
  const chargesInconnues = prixM2 != null && logement.chargesInconnues === true;
  // Excédent du prix sur un plafond, arrondi à l'euro supérieur : ce que devraient valoir les charges.
  const chargesPour = (plafondM2: number) =>
    chargesInconnues && prixM2! > plafondM2 ? Math.ceil(logement.prixMois! - plafondM2 * logement.nbM2!) : null;
  const epoques = [...new Set(correspondances.map((l) => l.epoque))].sort();
  const parEpoque = epoques.map((epoque) => {
    const plafonds = correspondances.filter((l) => l.epoque === epoque).map((l) => l.max);
    const haut = Math.max(...plafonds);
    const bas = Math.min(...plafonds);
    const depasse = prixM2 == null ? null : prixM2 > haut ? true : prixM2 <= bas ? false : null;
    return { epoque, max: haut, depasse, chargesMin: depasse ? chargesPour(haut) : null };
  });

  return {
    quartier: ids.size === 1 ? correspondances[0].nom_quartier : null,
    arrondissement: arrondissementDeLigne(correspondances[0]),
    annee,
    min: Math.min(...correspondances.map((l) => l.min)),
    ref: correspondances.length === 1 ? correspondances[0].ref : null,
    max,
    plafondMin,
    verdict,
    localisation,
    prixM2: prixM2 != null ? Math.round(prixM2 * 100) / 100 : null,
    loyerMaxMois: surfaceValide ? Math.round(max * logement.nbM2! * 100) / 100 : null,
    depasse: verdict === "depasse" ? true : verdict === "sous_plafonds" ? false : null,
    champsManquants,
    nbChampsManquants: champsManquants.length,
    parEpoque,
    chargesInconnues,
    chargesMin: verdict === "depasse" ? chargesPour(max) : null,
  };
}
