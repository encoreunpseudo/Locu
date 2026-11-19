import { GeometrieLocale } from "./GeometrieLocale";
import type { Position } from "./types";

type ObjetJson = Record<string, unknown>;

/** Lit uniquement le JSON déclaratif rattaché à l'URL active ; n'exécute jamais les scripts. */
export class LecteurJsonLd {
  coordonnees(doc: Document, urlActive: string): Position[] {
    const identifiant = this.identifiantAnnonce(urlActive);
    if (!identifiant) return [];
    const positions: Position[] = [];
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      let contenu: unknown;
      try { contenu = JSON.parse(script.textContent ?? ""); } catch { continue; }
      for (const annonce of this.objets(contenu)) {
        const types = Array.isArray(annonce["@type"]) ? annonce["@type"] : [annonce["@type"]];
        if (!types.includes("RealEstateListing")) continue;
        const urls = [annonce.url, annonce["@id"]].filter((v): v is string => typeof v === "string");
        if (!urls.length || !urls.every((url) => this.identifiantAnnonce(url) === identifiant)) continue;
        const logement = annonce.mainEntity as ObjetJson | undefined;
        const geo = logement?.geo as ObjetJson | undefined;
        const point = [geo?.longitude, geo?.latitude];
        if (GeometrieLocale.positionValide(point) && !positions.some((p) => p[0] === point[0] && p[1] === point[1])) positions.push(point);
      }
    }
    return positions;
  }

  private identifiantAnnonce(valeur: string): string | undefined {
    try {
      const url = new URL(valeur);
      if (url.hostname !== "jinka.fr" && !url.hostname.endsWith(".jinka.fr")) return undefined;
      return url.pathname.match(/^\/ad\/([^/]+)\/?$/)?.[1];
    } catch { return undefined; }
  }

  private *objets(valeur: unknown): Generator<ObjetJson> {
    if (Array.isArray(valeur)) {
      for (const enfant of valeur) yield* this.objets(enfant);
    } else if (valeur && typeof valeur === "object") {
      const objet = valeur as ObjetJson;
      yield objet;
      if (objet["@graph"]) yield* this.objets(objet["@graph"]);
    }
  }
}
