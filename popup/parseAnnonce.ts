import type { Epoque, Logement } from "./checkEncadrementLoyers";

// Base commune à tous les parseurs de sites d'annonces (Jinka, SeLoger, Leboncoin...)
export abstract class ParseurAnnonce {
  // Le parseur sait-il lire les pages de ce site ?
  abstract peutParser(url: URL): boolean;

  // Extrait les infos du logement depuis la page de l'annonce
  abstract parser(doc: Document): Logement;

  // "1 500 €" / "1 500,50 €" -> 1500 / 1500.5
  protected extrairePrix(texte: string): number | undefined {
    const m = texte.match(/(\d{1,3}(?:[\s  .]\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*€/);
    return m ? Number(m[1].replace(/[\s  .]/g, "").replace(",", ".")) : undefined;
  }

  // "Charges mensuelles : 100€" / "dont 100 € de charges" -> 100
  protected extraireCharges(texte: string): number | undefined {
    const m =
      texte.match(/charges(?:\s+mensuelles)?\s*:?\s*(\d[\d\s  ]*(?:,\d{1,2})?)\s*€/i) ??
      texte.match(/(\d[\d\s  ]*(?:,\d{1,2})?)\s*€\s*(?:de\s+)?charges/i);
    return m ? Number(m[1].replace(/[\s  ]/g, "").replace(",", ".")) : undefined;
  }

  // "40 m²" / "40,5 m2" -> 40 / 40.5
  protected extraireSurface(texte: string): number | undefined {
    const m = texte.match(/(\d+(?:[.,]\d+)?)\s*m(?:²|2)(?![a-z0-9])/i);
    return m ? Number(m[1].replace(",", ".")) : undefined;
  }

  // "2 pièces" / "T3" / "F2" / "studio" -> 2 / 3 / 2 / 1
  protected extrairePieces(texte: string): number | undefined {
    const m = texte.match(/(\d+)\s*pi[eè]ces?\b/i) ?? texte.match(/\b[TF](\d)\b/);
    if (m) return Number(m[1]);
    return /\bstudio\b/i.test(texte) ? 1 : undefined;
  }

  protected extraireMeuble(texte: string): boolean | undefined {
    if (/\bnon[\s-]?meubl/i.test(texte) || /\b(?:location|logement)\s+vide\b/i.test(texte)) return false;
    if (/\bmeubl[ée]e?s?(?![a-z])/i.test(texte)) return true;
    return undefined;
  }

  // "75011" / "Paris 11e" / "Paris 1er" -> 11 / 11 / 1
  protected extraireArrondissement(texte: string): number | undefined {
    const m = texte.match(/\b750(\d{2})\b/) ?? texte.match(/\bParis\s*(\d{1,2})\s*(?:e|er|ème|eme)?\b/i);
    const n = m ? Number(m[1]) : NaN;
    return n >= 1 && n <= 20 ? n : undefined;
  }

  // "construit en 1965" / "construction : 1965" -> "1946-1970"
  protected extraireEpoque(texte: string): Epoque | undefined {
    const m = texte.match(/(?:construit|construction|ann[ée]e de construction)\D{0,15}(1[6-9]\d{2}|20\d{2})/i);
    if (!m) return undefined;
    const annee = Number(m[1]);
    if (annee < 1946) return "Avant 1946";
    if (annee <= 1970) return "1946-1970";
    if (annee <= 1990) return "1971-1990";
    return "Apres 1990";
  }
}
