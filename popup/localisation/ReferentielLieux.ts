import { NormaliseurLieu } from "./NormaliseurLieu";
import type { DonneesLieux, Rue, Station } from "./types";

export interface RueMentionnee { nom: string; rue?: Rue; adresse: boolean }

/** Référentiels injectables : les tests et l'extension utilisent le même moteur hors ligne. */
export class ReferentielLieux {
  constructor(readonly donnees: DonneesLieux) {}

  ruesDans(description: string): RueMentionnee[] {
    const texte = NormaliseurLieu.normaliser(description);
    const reconnues = this.donnees.rues.flatMap((rue) => {
      const noms = [rue.nom, ...(rue.alias ?? [])].map(NormaliseurLieu.normaliser);
      return noms.flatMap((nom) => {
        const occurrences: { nom: string; rue: Rue; debut: number; fin: number }[] = [];
        const recherche = ` ${texte} `;
        let debut = recherche.indexOf(` ${nom} `);
        while (debut >= 0) {
          occurrences.push({ nom, rue, debut, fin: debut + nom.length });
          debut = recherche.indexOf(` ${nom} `, debut + 1);
        }
        return occurrences;
      });
    });
    // Le nom le plus long prime à une occurrence donnée, pas dans toute la description.
    const completes = reconnues.filter((r) => !reconnues.some((autre) =>
      autre.nom.length > r.nom.length && autre.debut <= r.debut && autre.fin >= r.fin));
    const resultat: RueMentionnee[] = [];
    for (const { rue, debut } of completes) {
      const adresse = this.estAdresse(texte, debut);
      const existante = resultat.find((r) => r.rue?.id === rue.id);
      if (existante) existante.adresse ||= adresse;
      else resultat.push({ nom: rue.nom, rue, adresse });
    }
    // Conserver aussi les mentions non résolues ; une regex ne leur invente pas de géométrie.
    const motif = /\b(?:rue|avenue|boulevard|bd\.?|av\.?)\s+[\p{L}\d][\p{L}\d '’\-]{1,70}/giu;
    for (const correspondance of description.matchAll(motif)) {
      const nom = correspondance[0].split(/\s+(?:au|avec|situ[ée]|dans|proche|comprenant|est|et)\s/i)[0].trim();
      const normalise = NormaliseurLieu.normaliser(nom);
      if (resultat.some((r) => NormaliseurLieu.contient(normalise, r.nom) || NormaliseurLieu.contient(NormaliseurLieu.normaliser(r.nom), nom))) continue;
      resultat.push({ nom, adresse: false });
    }
    return resultat;
  }

  stations(nom: string): Station[] {
    const cle = NormaliseurLieu.normaliser(nom);
    return this.donnees.stations.filter((s) => [s.nom, ...(s.alias ?? [])]
      .some((n) => NormaliseurLieu.normaliser(n) === cle));
  }

  stationsDans(description: string): string[] {
    const texte = NormaliseurLieu.normaliser(description);
    return this.donnees.stations.filter((s) => [s.nom, ...(s.alias ?? [])].some((nom) => {
      const normalise = NormaliseurLieu.normaliser(nom);
      const index = (` ${texte} `).indexOf(` ${normalise} `);
      return index >= 0 && /\b(metro|station|rer|gare)\b/.test(texte.slice(Math.max(0, index - 45), index));
    })).map((s) => s.nom);
  }

  private estAdresse(texte: string, index: number): boolean {
    const avant = texte.slice(Math.max(0, index - 70), index);
    if (/\b(proche|proximite|vue|donnant|pres|entre|angle|depuis|rejoindre|pas de)\b/.test(avant)) return false;
    return index === 0 || /\b(situe|situee|adresse|paris|louer)\b/.test(avant);
  }
}
