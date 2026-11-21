import { LecteurJsonLd } from "./LecteurJsonLd";
import { NormaliseurLieu } from "./NormaliseurLieu";
import type { IndicesLocalisation } from "./types";

export class ExtracteurLocalisationJinka {
  /** jinka.fr/ad/<id> → <id> */
  static identifiantAnnonce(valeur: string): string | undefined {
    try {
      const url = new URL(valeur);
      if (url.hostname !== "jinka.fr" && !url.hostname.endsWith(".jinka.fr")) return undefined;
      return url.pathname.match(/^\/ad\/([^/]+)\/?$/)?.[1];
    } catch { return undefined; }
  }

  constructor(private readonly jsonLd = new LecteurJsonLd(ExtracteurLocalisationJinka.identifiantAnnonce)) {}

  extraire(doc: Document, urlActive = doc.URL): IndicesLocalisation {
    const h1 = doc.querySelector("h1");
    const ligneInfos = h1?.parentElement?.nextElementSibling;
    // Rues et stations sont cherchées dans la description rédigée par l'annonceur.
    const description = [...doc.querySelectorAll("h2")].find((h) => h.textContent?.trim() === "Description")
      ?.nextElementSibling?.textContent?.replace(/\s+/g, " ").trim();
    return {
      site: "Jinka",
      quartier: ligneInfos?.querySelector("span:has(svg)")?.textContent?.trim() || undefined,
      arrondissement: NormaliseurLieu.arrondissement(h1?.textContent ?? ""),
      coordonnees: this.jsonLd.coordonnees(doc, urlActive),
      texte: description || undefined,
    };
  }
}
