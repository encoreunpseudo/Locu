import { GeometrieLocale } from "./GeometrieLocale";
import { NormaliseurLieu } from "./NormaliseurLieu";
import type { Position, Quartier } from "./types";

export class ReferentielQuartiers {
  private readonly noms = new Map<string, Quartier[]>();

  constructor(readonly quartiers: readonly Quartier[]) {
    for (const quartier of quartiers) this.ajouterNom(quartier.nom, quartier);
    // Alias explicite vers un identifiant stable, pas de suppression aveugle de suffixes.
    const javel = quartiers.find((q) => q.id === 7511560);
    if (javel) this.ajouterNom("Javel", javel);
  }

  parNom(nom: string): Quartier[] {
    return this.noms.get(NormaliseurLieu.normaliser(nom)) ?? [];
  }

  parArrondissement(arrondissement: number): Quartier[] {
    return this.quartiers.filter((q) => q.arrondissement === arrondissement);
  }

  contenant(point: Position): Quartier[] {
    if (!GeometrieLocale.positionValide(point)) return [];
    return this.quartiers.filter((q) => GeometrieLocale.contient(q.geometrie, point));
  }

  private ajouterNom(nom: string, quartier: Quartier): void {
    const cle = NormaliseurLieu.normaliser(nom);
    const existants = this.noms.get(cle) ?? [];
    if (!existants.some((q) => q.id === quartier.id)) this.noms.set(cle, [...existants, quartier]);
  }
}
