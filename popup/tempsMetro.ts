import { CLE_PRIM } from "./config";
import type { PositionEstimee } from "./localisation/types";
import { ClientPrim } from "./trajets/ClientPrim";
import { fourchette, prochainDepart, RAYON_MAX } from "./trajets/EstimateurTrajet";
import type { Itineraire, Lieu, TempsTrajet } from "./trajets/types";

export type { Lieu, TempsTrajet } from "./trajets/types";

const DUREE_CACHE = 7 * 24 * 3600 * 1000;

export async function lireLieux(): Promise<Lieu[]> {
  try {
    const { lieux } = await chrome.storage.sync.get("lieux");
    return Array.isArray(lieux) ? lieux as Lieu[] : [];
  } catch {
    return [];
  }
}

/** Temps vers chaque lieu enregistré depuis la position estimée du logement ; un échec n'empêche pas les autres. */
export async function tempsTrajets(
  position: PositionEstimee, lieux: Lieu[], client = new ClientPrim(CLE_PRIM), maintenant = new Date(),
): Promise<TempsTrajet[]> {
  if (position.rayonMetres > RAYON_MAX) {
    return lieux.map((lieu) => ({ lieu, erreur: "Position du logement trop imprécise" }));
  }
  const depart = prochainDepart(maintenant);
  return Promise.all(lieux.map(async (lieu): Promise<TempsTrajet> => {
    try {
      const itineraire = await itineraireEnCache(client, position, lieu, depart, maintenant.getTime());
      const f = fourchette(itineraire, position.rayonMetres)!;
      return { lieu, itineraire, minMinutes: f.min, maxMinutes: f.max };
    } catch (erreur) {
      return { lieu, erreur: erreur instanceof Error ? erreur.message : "Itinéraire indisponible" };
    }
  }));
}

// Même logement (à ~10 m près) et même lieu : inutile de rappeler PRIM pendant une semaine.
async function itineraireEnCache(client: ClientPrim, position: PositionEstimee, lieu: Lieu, depart: string, maintenant: number): Promise<Itineraire> {
  const [lon, lat] = position.point;
  const cle = `trajet3:${lon.toFixed(4)},${lat.toFixed(4)}:${lieu.id}:${lieu.position.join(",")}`;
  try {
    const cache = (await chrome.storage.local.get(cle))[cle] as { date: number; itineraire: Itineraire } | undefined;
    if (cache && maintenant - cache.date < DUREE_CACHE) return cache.itineraire;
  } catch { /* pas de cache disponible */ }
  const itineraire = await client.itineraire(position.point, lieu.position, depart);
  try { await chrome.storage.local.set({ [cle]: { date: maintenant, itineraire } }); } catch { /* cache facultatif */ }
  return itineraire;
}
