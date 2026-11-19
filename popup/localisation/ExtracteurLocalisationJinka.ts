import { LecteurJsonLd } from "./LecteurJsonLd";
import { NormaliseurLieu } from "./NormaliseurLieu";
import type { IndicesLocalisation } from "./types";

export class ExtracteurLocalisationJinka {
  constructor(private readonly jsonLd = new LecteurJsonLd()) {}

  extraire(doc: Document, urlActive = doc.URL): IndicesLocalisation {
    const h1 = doc.querySelector("h1");
    const ligneInfos = h1?.parentElement?.nextElementSibling;
    return {
      quartier: ligneInfos?.querySelector("span:has(svg)")?.textContent?.trim() || undefined,
      arrondissement: NormaliseurLieu.arrondissement(h1?.textContent ?? ""),
      coordonnees: this.jsonLd.coordonnees(doc, urlActive),
    };
  }
}
