import { LecteurJsonLd } from "./LecteurJsonLd";
import { NormaliseurLieu } from "./NormaliseurLieu";
import type { IndicesLocalisation } from "./types";

export class ExtracteurLocalisationJinka {
  constructor(private readonly jsonLd = new LecteurJsonLd()) {}

  extraire(doc: Document, urlActive = doc.URL): IndicesLocalisation {
    const h1 = doc.querySelector("h1");
    const ligneInfos = h1?.parentElement?.nextElementSibling;
    // Rues et stations sont cherchées dans la description rédigée par l'annonceur.
    const description = [...doc.querySelectorAll("h2")].find((h) => h.textContent?.trim() === "Description")
      ?.nextElementSibling?.textContent?.replace(/\s+/g, " ").trim();
    return {
      quartier: ligneInfos?.querySelector("span:has(svg)")?.textContent?.trim() || undefined,
      arrondissement: NormaliseurLieu.arrondissement(h1?.textContent ?? ""),
      coordonnees: this.jsonLd.coordonnees(doc, urlActive),
      texte: description || undefined,
    };
  }
}
