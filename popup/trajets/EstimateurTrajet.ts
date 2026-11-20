import type { Itineraire } from "./types";

/** Vitesse de marche retenue pour convertir l'incertitude de position en minutes. */
export const METRES_PAR_MINUTE = 80;
/** Au-delà, la position (centre d'arrondissement…) est trop vague pour annoncer un temps. */
export const RAYON_MAX = 1500;

/**
 * Prochain jour ouvré à 8 h 30, heure de Paris, au format Navitia (AAAAMMJJTHHMMSS) :
 * le résultat ne dépend pas de l'heure à laquelle on ouvre la popup. Jours fériés ignorés.
 */
export function prochainDepart(maintenant: Date): string {
  const parties = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(maintenant).map((p) => [p.type, p.value]));
  const jour = new Date(Date.UTC(Number(parties.year), Number(parties.month) - 1, Number(parties.day)));
  const dejaPasse = Number(parties.hour) * 60 + Number(parties.minute) >= 8 * 60 + 30;
  if (dejaPasse) jour.setUTCDate(jour.getUTCDate() + 1);
  while (jour.getUTCDay() === 0 || jour.getUTCDay() === 6) jour.setUTCDate(jour.getUTCDate() + 1);
  const deux = (n: number) => String(n).padStart(2, "0");
  return `${jour.getUTCFullYear()}${deux(jour.getUTCMonth() + 1)}${deux(jour.getUTCDate())}T083000`;
}

/**
 * Fourchette en minutes : le logement est à `rayonMetres` près, soit `marge` minutes de marche en plus
 * ou en moins. On ne peut pas gagner plus que la marche jusqu'au premier arrêt.
 * Renvoie undefined si la position est trop imprécise pour annoncer un temps.
 */
export function fourchette(itineraire: Itineraire, rayonMetres: number): { min: number; max: number } | undefined {
  if (rayonMetres > RAYON_MAX) return undefined;
  const marge = (rayonMetres / METRES_PAR_MINUTE) * 60;
  return {
    min: Math.max(1, Math.round((itineraire.duree - Math.min(marge, itineraire.marcheDepart)) / 60)),
    max: Math.round((itineraire.duree + marge) / 60),
  };
}
