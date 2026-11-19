import { GeometrieLocale } from "./GeometrieLocale";
import { NormaliseurLieu } from "./NormaliseurLieu";
import type { Arret, GeometrieQuartier, Position, TraceVoie, Voie } from "./types";

type Requete = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
type Ligne = Record<string, unknown>;

export interface Stockage {
  lire(cle: string): Promise<unknown>;
  ecrire(cle: string, valeur: unknown): Promise<void>;
}

/** chrome.storage.local quand il existe ; sinon aucun cache persistant (tests, page hors extension). */
class StockageChrome implements Stockage {
  async lire(cle: string): Promise<unknown> {
    try { return (await chrome.storage.local.get(cle))[cle]; } catch { return undefined; }
  }
  async ecrire(cle: string, valeur: unknown): Promise<void> {
    try { await chrome.storage.local.set({ [cle]: valeur }); } catch { /* cache facultatif */ }
  }
}

const VOIES = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/denominations-emprises-voies-actuelles/exports/json";
const GARES = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/emplacement-des-gares-idf/exports/json";
const VERSION = 1;
const DUREE_CACHE = 30 * 24 * 3600 * 1000;

/**
 * Référentiels publics de rues (Ville de Paris) et d'arrêts (IDFM), consultés en ligne puis mis en cache.
 * Seuls des noms de voies publiques sont envoyés ; rien sur l'utilisateur ni sur l'annonce.
 * En cas d'échec, chaque méthode renvoie null : la localisation continue sans ces indices.
 */
export class SourcesLieux {
  private readonly memoire = new Map<string, Promise<unknown>>();

  constructor(
    private readonly requete: Requete = (url) => fetch(url),
    private readonly stockage: Stockage = new StockageChrome(),
    private readonly maintenant = () => Date.now(),
  ) {}

  voies(): Promise<Voie[] | null> {
    const url = `${VOIES}?select=typo_min,arrdt,quartier&where=${encodeURIComponent('validite="Dénomination actuelle"')}`;
    return this.charger("lieux:voies", url, (lignes) => lignes.flatMap((l): Voie[] =>
      typeof l.typo_min !== "string" ? [] : [{
        nom: l.typo_min,
        arrondissements: this.textes(l.arrdt).map((a) => NormaliseurLieu.arrondissement(a)).filter((a): a is number => a != null),
        quartiers: this.textes(l.quartier),
      }]));
  }

  stations(): Promise<Arret[] | null> {
    // Boîte englobant Paris et ses portes.
    const url = `${GARES}?select=nom_gares,mode,indice_lig,geo_point_2d&where=${encodeURIComponent("in_bbox(geo_point_2d,48.80,2.20,48.92,2.50)")}`;
    return this.charger("lieux:stations", url, (lignes) => lignes.flatMap((l): Arret[] => {
      const position = this.point(l.geo_point_2d);
      return typeof l.nom_gares === "string" && position
        ? [{ nom: l.nom_gares, mode: String(l.mode ?? ""), ligne: String(l.indice_lig ?? ""), position }]
        : [];
    }));
  }

  /** Tracé d'une seule voie, demandé seulement quand elle est citée dans l'annonce. */
  trace(nom: string): Promise<TraceVoie | null> {
    const url = `${VOIES}?select=longueur,geo_point_2d,geo_shape&where=${encodeURIComponent(`typo_min="${nom.replace(/["\\]/g, "")}"`)}`;
    return this.charger(`lieux:trace:${nom}`, url, (lignes) => {
      const l = lignes[0];
      const centre = this.point(l?.geo_point_2d);
      const geometrie = (l?.geo_shape as { geometry?: GeometrieQuartier } | undefined)?.geometry;
      if (!centre || !geometrie || (geometrie.type !== "Polygon" && geometrie.type !== "MultiPolygon")) return null;
      return { centre, longueur: Number(l.longueur) || 0, geometrie };
    });
  }

  private charger<T>(cle: string, url: string, convertir: (lignes: Ligne[]) => T): Promise<T | null> {
    let promesse = this.memoire.get(cle) as Promise<T | null> | undefined;
    if (!promesse) {
      promesse = this.lire<T>(cle, url, convertir);
      this.memoire.set(cle, promesse);
      // Un échec n'est pas mémorisé : on réessaiera à la prochaine analyse.
      promesse.then((v) => { if (v == null) this.memoire.delete(cle); });
    }
    return promesse;
  }

  private async lire<T>(cle: string, url: string, convertir: (lignes: Ligne[]) => T): Promise<T | null> {
    const cache = await this.stockage.lire(cle) as { version: number; date: number; donnees: T } | undefined;
    if (cache?.version === VERSION && this.maintenant() - cache.date < DUREE_CACHE) return cache.donnees;
    try {
      const reponse = await this.requete(url);
      if (!reponse.ok) return null;
      const lignes = await reponse.json();
      if (!Array.isArray(lignes)) return null;
      const donnees = convertir(lignes as Ligne[]);
      if (donnees != null) await this.stockage.ecrire(cle, { version: VERSION, date: this.maintenant(), donnees });
      return donnees;
    } catch {
      return null;
    }
  }

  private textes(valeur: unknown): string[] {
    return (Array.isArray(valeur) ? valeur : [valeur]).filter((v): v is string => typeof v === "string");
  }

  private point(valeur: unknown): Position | undefined {
    const v = valeur as { lon?: unknown; lat?: unknown } | undefined;
    const position = [v?.lon, v?.lat];
    return GeometrieLocale.positionValide(position) ? position : undefined;
  }
}
