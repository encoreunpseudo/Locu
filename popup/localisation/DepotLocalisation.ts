import { ReferentielQuartiers } from "./ReferentielQuartiers";
import { ResolveurLocalisation } from "./ResolveurLocalisation";
import type { IndicesLocalisation, Quartier, ResultatLocalisation } from "./types";

/** Seul accès I/O : les polygones des quartiers empaquetés dans l'extension, aucune API distante. */
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
    const reponse = await fetch(chrome.runtime.getURL("data/quartiers.json"));
    if (!reponse.ok) throw new Error("Référentiel local indisponible : data/quartiers.json");
    return new ResolveurLocalisation(new ReferentielQuartiers(await reponse.json() as Quartier[]));
  }
}
