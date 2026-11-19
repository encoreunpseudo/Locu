import { NormaliseurLieu } from "./NormaliseurLieu";

export class AnalyseurProximite {
  /** Rayon indicatif pour classer, jamais pour exclure un quartier. */
  rayonIndicatif(description: string, station: string): number {
    const texte = NormaliseurLieu.normaliser(description);
    const nom = NormaliseurLieu.normaliser(station);
    const index = (` ${texte} `).indexOf(` ${nom} `);
    if (index < 0) return 800;
    const avant = texte.slice(Math.max(0, index - 65), index);
    const metres = avant.match(/\b(\d{1,4})\s*(?:m|metres?)\s+(?:(?:de|du|la|le|metro|station)\s+)*$/);
    if (metres) return Math.min(5000, Number(metres[1]) + 150);
    const minutes = avant.match(/\b(\d{1,2})\s*(?:min|minutes?)\s+a\s+pied\s+(?:(?:de|du|la|le|metro|station)\s+)*$/);
    return minutes ? Math.min(5000, Number(minutes[1]) * 80 + 150) : 800;
  }
}
