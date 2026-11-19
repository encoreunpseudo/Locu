import { DetecteurLieux } from "./DetecteurLieux";
import { ReferentielQuartiers } from "./ReferentielQuartiers";
import { ResolveurLocalisation } from "./ResolveurLocalisation";
import { SourcesLieux } from "./SourcesLieux";
import type { IndicesLocalisation, Quartier, ResultatLocalisation } from "./types";

/**
 * Seul point d'I/O : les polygones des quartiers empaquetés dans l'extension, et les référentiels
 * publics de rues et de stations (consultés en ligne seulement si l'annonce a une description).
 */
export class DepotLocalisation {
  private chargement?: Promise<ResolveurLocalisation>;

  constructor(private readonly sources = new SourcesLieux()) {}

  async localiser(indices: IndicesLocalisation): Promise<ResultatLocalisation> {
    this.chargement ??= this.charger().catch((erreur) => {
      this.chargement = undefined;
      throw erreur;
    });
    const [resolveur, lieux] = await Promise.all([this.chargement, this.lieux(indices)]);
    return resolveur.resoudre({ ...indices, ...lieux });
  }

  private async charger(): Promise<ResolveurLocalisation> {
    const reponse = await fetch(chrome.runtime.getURL("data/quartiers.json"));
    if (!reponse.ok) throw new Error("Référentiel local indisponible : data/quartiers.json");
    return new ResolveurLocalisation(new ReferentielQuartiers(await reponse.json() as Quartier[]));
  }

  /** Rues et stations citées dans la description, avec le tracé des rues trouvées. */
  private async lieux(indices: IndicesLocalisation): Promise<Partial<IndicesLocalisation>> {
    if (!indices.texte) return {};
    const [voies, arrets] = await Promise.all([this.sources.voies(), this.sources.stations()]);
    const { rues, stations } = new DetecteurLieux(voies ?? [], arrets ?? []).detecter(indices.texte, indices.arrondissement);
    const avecTraces = await Promise.all(rues.map(async (rue) => {
      const trace = await this.sources.trace(rue.nom);
      return trace ? { ...rue, trace } : rue;
    }));
    return { rues: avecTraces, stations, lieuxIndisponibles: voies == null || arrets == null };
  }
}
