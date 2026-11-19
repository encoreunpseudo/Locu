import { ReferentielLieux } from "./ReferentielLieux";
import { ReferentielQuartiers } from "./ReferentielQuartiers";
import { ResolveurLocalisation } from "./ResolveurLocalisation";
import type { DonneesLieux, IndicesLocalisation, Quartier, ResultatLocalisation } from "./types";

/** Seul accès I/O : deux ressources empaquetées dans l'extension, aucune API distante. */
export class DepotLocalisation {
  private chargement?: Promise<ResolveurLocalisation>;

  async localiser(indices: IndicesLocalisation): Promise<ResultatLocalisation> {
    this.chargement ??= this.charger().catch((erreur) => {
      this.chargement = undefined;
      throw erreur;
    });
    return (await this.chargement).resoudre(indices);
  }

  private async charger(): Promise<ResolveurLocalisation> {
    const [quartiers, lieux] = await Promise.all([
      this.lire<Quartier[]>("data/quartiers.json"),
      this.lire<DonneesLieux>("data/localisation-lieux.json"),
    ]);
    return new ResolveurLocalisation(new ReferentielQuartiers(quartiers), new ReferentielLieux(lieux));
  }

  private async lire<T>(chemin: string): Promise<T> {
    const reponse = await fetch(chrome.runtime.getURL(chemin));
    if (!reponse.ok) throw new Error(`Référentiel local indisponible : ${chemin}`);
    return reponse.json() as Promise<T>;
  }
}
