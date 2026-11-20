import { GeometrieLocale } from "../localisation/GeometrieLocale";
import type { Position } from "../localisation/types";

type Requete = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

const URL_GEOCODAGE = "https://data.geopf.fr/geocodage/search";
// Paris et petite/grande couronne : les trajets IDFM ne couvrent que l'Île-de-France.
const ILE_DE_FRANCE = /^(75|77|78|91|92|93|94|95)\d{3}$/;

/** Adresses suggérées par l'API Adresse de l'IGN (sans clé), limitées à l'Île-de-France. */
export class Geocodeur {
  constructor(private readonly requete: Requete = (url) => fetch(url)) {}

  async suggerer(texte: string): Promise<{ label: string; position: Position }[]> {
    if (texte.trim().length < 3) return [];
    const reponse = await this.requete(`${URL_GEOCODAGE}?q=${encodeURIComponent(texte.trim())}&limit=8`);
    if (!reponse.ok) throw new Error("Service d'adresses indisponible");
    const { features } = await reponse.json() as { features?: { geometry?: { coordinates?: unknown }; properties?: Record<string, unknown> }[] };
    return (features ?? []).flatMap((f) => {
      const position = f.geometry?.coordinates;
      const { label, postcode } = f.properties ?? {};
      return typeof label === "string" && typeof postcode === "string" && ILE_DE_FRANCE.test(postcode) && GeometrieLocale.positionValide(position)
        ? [{ label, position }]
        : [];
    }).slice(0, 5);
  }
}
