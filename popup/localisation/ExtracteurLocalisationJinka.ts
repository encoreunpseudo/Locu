import { LecteurJsonLd } from "./LecteurJsonLd";
import { NormaliseurLieu } from "./NormaliseurLieu";
import type { IndicesLocalisation } from "./types";

export class ExtracteurLocalisationJinka {
  constructor(private readonly jsonLd = new LecteurJsonLd()) {}

  extraire(doc: Document, description: string, urlActive = doc.URL): IndicesLocalisation {
    const h1 = doc.querySelector("h1");
    const ligneInfos = h1?.parentElement?.nextElementSibling;
    const titreStations = [...doc.querySelectorAll("h2")]
      .find((h) => h.textContent?.trim() === "Proche des stations");
    const stations = [...(titreStations?.nextElementSibling?.querySelectorAll("span") ?? [])]
      .map((s) => s.textContent?.trim() ?? "").filter(Boolean);
    return {
      quartier: ligneInfos?.querySelector("span:has(svg)")?.textContent?.trim() || undefined,
      arrondissement: NormaliseurLieu.arrondissement(h1?.textContent ?? ""),
      description,
      stations: [...new Set(stations)],
      coordonnees: this.jsonLd.coordonnees(doc, urlActive),
    };
  }
}
