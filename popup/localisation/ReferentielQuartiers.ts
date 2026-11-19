import { GeometrieLocale } from "./GeometrieLocale";
import { NormaliseurLieu } from "./NormaliseurLieu";
import type { Position, Quartier } from "./types";

export class ReferentielQuartiers {
  private readonly noms = new Map<string, Quartier[]>();

  constructor(readonly quartiers: readonly Quartier[]) {
    for (const quartier of quartiers) this.ajouterNom(quartier.nom, quartier);
    // Alias explicite vers un identifiant stable, pas de suppression aveugle de suffixes.
    // Les noms du référentiel des voies (quartiers administratifs) diffèrent parfois de ceux du barème.
    for (const [id, alias] of ReferentielQuartiers.ALIAS) {
      const quartier = quartiers.find((q) => q.id === id);
      if (quartier) this.ajouterNom(alias, quartier);
    }
  }

  private static readonly ALIAS: [number, string][] = [
    [7511560, "Javel"], [7511872, "Chapelle"], [7510312, "Sainte-Avoye"], [7511974, "Pont de Flandres"],
  ];

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

  /** Quartiers à moins de `rayon` mètres du point. */
  proches(point: Position, rayon: number): Quartier[] {
    if (!GeometrieLocale.positionValide(point)) return [];
    return this.quartiers.filter((q) => GeometrieLocale.distance(q.geometrie, point) <= rayon);
  }

  private ajouterNom(nom: string, quartier: Quartier): void {
    const cle = NormaliseurLieu.normaliser(nom);
    const existants = this.noms.get(cle) ?? [];
    if (!existants.some((q) => q.id === quartier.id)) this.noms.set(cle, [...existants, quartier]);
  }
}
