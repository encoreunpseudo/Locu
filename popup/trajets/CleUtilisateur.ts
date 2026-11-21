import type { Position } from "../localisation/types";
import { ClientPrim, ErreurPrim } from "./ClientPrim";
import { prochainDepart } from "./EstimateurTrajet";

/**
 * Clé PRIM personnelle de l'utilisateur, saisie dans les options.
 * Rangée dans chrome.storage.local : elle reste sur cet appareil (pas de synchronisation de compte)
 * et n'est envoyée qu'à PRIM, dans l'en-tête de ses requêtes.
 */
const STOCKAGE = "clePrim";

export async function lireClePrim(): Promise<string> {
  try {
    const valeur = (await chrome.storage.local.get(STOCKAGE))[STOCKAGE];
    return typeof valeur === "string" ? valeur : "";
  } catch {
    return "";
  }
}

export async function enregistrerClePrim(cle: string): Promise<void> {
  await chrome.storage.local.set({ [STOCKAGE]: cle.trim() });
}

export async function supprimerClePrim(): Promise<void> {
  await chrome.storage.local.remove(STOCKAGE);
}

// Trajet de test : Châtelet → Gare de Lyon, toujours desservi.
const CHATELET: Position = [2.3470, 48.8583];
const GARE_DE_LYON: Position = [2.3730, 48.8443];

/**
 * Essaie la clé sur un vrai calcul d'itinéraire.
 * « aucun » itinéraire veut quand même dire que PRIM a accepté la clé.
 */
export async function verifierClePrim(
  cle: string, client = new ClientPrim(cle.trim()), maintenant = new Date(),
): Promise<"valide" | ErreurPrim["code"]> {
  try {
    await client.itineraire(CHATELET, GARE_DE_LYON, prochainDepart(maintenant));
    return "valide";
  } catch (erreur) {
    if (!(erreur instanceof ErreurPrim)) return "reseau";
    return erreur.code === "aucun" ? "valide" : erreur.code;
  }
}
