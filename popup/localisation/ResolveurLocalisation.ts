import { AnalyseurProximite } from "./AnalyseurProximite";
import { ReferentielLieux } from "./ReferentielLieux";
import { ReferentielQuartiers } from "./ReferentielQuartiers";
import type { IndiceResolu, IndicesLocalisation, Quartier, ResultatLocalisation } from "./types";

export class ResolveurLocalisation {
  constructor(
    private readonly quartiers: ReferentielQuartiers,
    private readonly lieux: ReferentielLieux,
    private readonly proximite = new AnalyseurProximite(),
  ) {}

  resoudre(entree: IndicesLocalisation): ResultatLocalisation {
    const indices: IndiceResolu[] = [];
    const avertissements: string[] = [];
    const ajouter = (type: IndiceResolu["type"], libelle: string, source: string, quartiers: Quartier[], contraignant = false) =>
      indices.push({ type, libelle, source, quartiers: quartiers.map((q) => q.id), contraignant });

    if (entree.quartier) {
      const trouves = this.quartiers.parNom(entree.quartier);
      ajouter("quartier", entree.quartier, "Quartier affiché par Jinka", trouves, true);
      if (!trouves.length) avertissements.push(`Quartier non reconnu : ${entree.quartier}.`);
      // Le quartier affiché par Jinka suffit : rues, stations et coordonnées ne servent qu'à défaut.
      const coherents = trouves.filter((q) => entree.arrondissement == null || q.arrondissement === entree.arrondissement);
      if (coherents.length === 1) {
        const [{ id, nom, arrondissement }] = coherents;
        return { statut: "renseignee", quartiers: [{ id, nom, arrondissement }], indices, avertissements };
      }
    }

    const rues = this.lieux.ruesDans(entree.description);
    for (const mention of rues) {
      ajouter("rue", mention.nom, "Description de l'annonce", mention.rue ? this.quartiers.leLongDe(mention.rue) : [], mention.adresse);
      if (!mention.rue) avertissements.push(`Rue non résolue dans le référentiel local : ${mention.nom}.`);
    }

    const nomsStations = [...new Set([...entree.stations, ...this.lieux.stationsDans(entree.description)])];
    for (const nom of nomsStations) {
      const stations = this.lieux.stations(nom);
      const rayon = this.proximite.rayonIndicatif(entree.description, nom);
      const proches = stations.flatMap((s) => s.positions.flatMap((p) => this.quartiers.autour(p, rayon)));
      ajouter("station", nom, `Proximité indicative (${rayon} m), sans exclusion`, proches);
      if (!stations.length) avertissements.push(`Station non résolue dans le référentiel local : ${nom}.`);
    }

    for (const position of entree.coordonnees) {
      ajouter("coordonnees", position.join(", "), "JSON-LD de l'annonce active, précision inconnue", this.quartiers.autour(position));
    }
    if (entree.coordonnees.length) avertissements.push("Les coordonnées Jinka ont une précision inconnue ; elles ne réduisent pas seules les quartiers possibles.");

    const forts = indices.filter((i) => i.contraignant && i.quartiers.length);
    const base = entree.arrondissement != null ? this.quartiers.parArrondissement(entree.arrondissement) : [...this.quartiers.quartiers];
    let candidats = base;
    for (const indice of forts) candidats = candidats.filter((q) => indice.quartiers.includes(q.id));

    const conflit = forts.length > 0 && candidats.length === 0;
    if (conflit) {
      // Ne jamais masquer une contradiction par un choix arbitraire ou une intersection vide.
      const ids = new Set([...base.map((q) => q.id), ...forts.flatMap((i) => i.quartiers)]);
      candidats = this.quartiers.quartiers.filter((q) => ids.has(q.id));
      avertissements.push("Les indices de localisation se contredisent. Les quartiers concernés sont conservés.");
    }

    const contradictionFaible = forts.length > 0 && indices.some((i) =>
      !i.contraignant && i.quartiers.length > 0 && !candidats.some((q) => i.quartiers.includes(q.id)));
    if (contradictionFaible) {
      avertissements.push("Un indice de proximité ou les coordonnées ne concordent pas avec la localisation retenue ; elle reste à confirmer.");
    }

    const aUnLieu = entree.arrondissement != null || indices.some((i) => i.quartiers.length);
    if (!aUnLieu) candidats = [];
    // Les indices faibles ordonnent les candidats sans devenir des contraintes géographiques.
    const score = (q: Quartier) => indices.filter((i) => !i.contraignant && i.quartiers.includes(q.id)).length;
    candidats = [...candidats].sort((a, b) => score(b) - score(a) || a.id - b.id);

    const quartierRenseigne = forts.some((i) => i.type === "quartier");
    const statut = !candidats.length ? "introuvable" : conflit || contradictionFaible ? "ambigue" :
      quartierRenseigne && candidats.length === 1 ? "renseignee" :
      forts.some((i) => i.type === "rue") ? "estimee" : "ambigue";
    return {
      statut,
      quartiers: candidats.map(({ id, nom, arrondissement }) => ({ id, nom, arrondissement })),
      indices,
      avertissements: [...new Set(avertissements)],
    };
  }
}
