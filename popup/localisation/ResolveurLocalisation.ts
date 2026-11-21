import { GeometrieLocale } from "./GeometrieLocale";
import { ReferentielQuartiers } from "./ReferentielQuartiers";
import type {
  GeometrieQuartier, IndiceResolu, IndicesLocalisation, PositionEstimee, Quartier, ResultatLocalisation, RueDetectee,
} from "./types";

const resume = ({ id, nom, arrondissement }: Quartier) => ({ id, nom, arrondissement });

/** « Proche du métro » : quartiers à moins de cette distance d'une station citée. */
const RAYON_STATION = 500;

type Base = Omit<ResultatLocalisation, "position">;

export class ResolveurLocalisation {
  constructor(private readonly quartiers: ReferentielQuartiers) {}

  resoudre(entree: IndicesLocalisation): ResultatLocalisation {
    const resultat = this.quartiersDe(entree);
    const position = this.position(entree, new Set(resultat.quartiers.map((q) => q.id)));
    return position ? { ...resultat, position } : resultat;
  }

  private quartiersDe(entree: IndicesLocalisation): Base {
    const indices: IndiceResolu[] = [];
    const avertissements: string[] = [];
    if (entree.lieuxIndisponibles) avertissements.push("Rues et stations citées non vérifiées : référentiels en ligne injoignables.");
    const base = entree.arrondissement != null ? this.quartiers.parArrondissement(entree.arrondissement) : [];
    const dansBase = (q: Quartier) => entree.arrondissement == null || q.arrondissement === entree.arrondissement;

    // 1. Le quartier affiché par le site suffit.
    if (entree.quartier) {
      const trouves = this.quartiers.parNom(entree.quartier);
      const source = `Quartier affiché par ${entree.site ?? "l'annonce"}`;
      indices.push({ type: "quartier", libelle: entree.quartier, source, quartiers: trouves.map((q) => q.id) });
      const coherents = trouves.filter(dansBase);
      if (coherents.length === 1) return { statut: "renseignee", quartiers: [resume(coherents[0])], indices, avertissements };
      if (!trouves.length) {
        avertissements.push(`Quartier non reconnu : ${entree.quartier}.`);
      } else {
        // Ne jamais masquer une contradiction par un choix arbitraire.
        avertissements.push("Le quartier affiché ne correspond pas à l'arrondissement. Les quartiers concernés sont conservés.");
        const ids = new Set([...base, ...trouves].map((q) => q.id));
        return { statut: "ambigue", quartiers: this.quartiers.quartiers.filter((q) => ids.has(q.id)).map(resume), indices, avertissements };
      }
    }

    // 2. À défaut, chaque indice (quartier cité, position, rue, station) vote pour les quartiers qu'il permet.
    const votes: { source: string; quartiers: Quartier[] }[] = [];
    for (const q of entree.texte ? this.quartiers.citesDans(entree.texte) : []) {
      const trouves = dansBase(q) ? [q] : [];
      indices.push({ type: "quartier", libelle: q.nom, source: "Quartier cité dans l'annonce", quartiers: trouves.map((t) => t.id) });
      if (trouves.length) votes.push({ source: `quartier ${q.nom} cité`, quartiers: trouves });
    }
    const contenants = new Map<number, Quartier>();
    for (const position of entree.coordonnees) {
      const trouves = this.quartiers.contenant(position).filter(dansBase);
      indices.push({ type: "coordonnees", libelle: position.join(", "), source: "Position de l'annonce (JSON-LD)", quartiers: trouves.map((q) => q.id) });
      for (const q of trouves) contenants.set(q.id, q);
    }
    if (contenants.size) votes.push({ source: "position approximative de l'annonce", quartiers: [...contenants.values()] });
    for (const rue of entree.rues ?? []) {
      const trouves = this.quartiersDeRue(rue).filter(dansBase);
      indices.push({ type: "rue", libelle: rue.nom, source: "Voie citée dans l'annonce", quartiers: trouves.map((q) => q.id) });
      if (trouves.length) votes.push({ source: rue.nom, quartiers: trouves });
    }
    for (const station of entree.stations ?? []) {
      const trouves = this.quartiers.proches(station.position, RAYON_STATION).filter(dansBase);
      indices.push({ type: "station", libelle: `${station.nom} (${station.lignes.join(", ")})`, source: "Station citée dans l'annonce", quartiers: trouves.map((q) => q.id) });
      if (trouves.length) votes.push({ source: `station ${station.nom}`, quartiers: trouves });
    }

    if (votes.length) {
      const compte = new Map<number, { quartier: Quartier; voix: number }>();
      for (const vote of votes) {
        for (const q of vote.quartiers) compte.set(q.id, { quartier: q, voix: (compte.get(q.id)?.voix ?? 0) + 1 });
      }
      const max = Math.max(...[...compte.values()].map((c) => c.voix));
      const candidats = [...compte.values()].filter((c) => c.voix === max).map((c) => c.quartier).sort((a, b) => a.id - b.id);
      if (max < votes.length) {
        avertissements.push(`Indices contradictoires (${this.liste(votes.map((v) => v.source))}) : seuls les quartiers cités par le plus d'indices sont conservés.`);
      }
      if (candidats.length === 1) {
        const sources = votes.filter((v) => v.quartiers.some((q) => q.id === candidats[0].id)).map((v) => v.source);
        avertissements.push(`Quartier déduit de : ${this.liste(sources)}.`);
        return { statut: "estimee", quartiers: candidats.map(resume), indices, avertissements };
      }
      return { statut: "ambigue", quartiers: candidats.map(resume), indices, avertissements };
    }

    // 3. Sinon, tous les quartiers de l'arrondissement.
    return {
      statut: base.length ? "ambigue" : "introuvable",
      quartiers: [...base].sort((a, b) => a.id - b.id).map(resume),
      indices,
      avertissements,
    };
  }

  /**
   * Meilleur point connu, du plus précis au plus grossier, en n'utilisant que des indices
   * compatibles avec les quartiers retenus (ou tous, si aucun quartier n'a été retenu).
   */
  private position(entree: IndicesLocalisation, ids: Set<number>): PositionEstimee | undefined {
    const compatible = (quartiers: Quartier[]) => ids.size === 0 || quartiers.some((q) => ids.has(q.id));
    const rues = (entree.rues ?? []).filter((r): r is RueDetectee & { trace: NonNullable<RueDetectee["trace"]> } =>
      r.trace != null && compatible(this.quartiersDeRue(r)));
    const stations = (entree.stations ?? []).filter((s) => compatible(this.quartiers.proches(s.position, RAYON_STATION)));

    // 1. La position de l'annonce, si elle tombe dans un quartier retenu et le long d'une rue citée.
    for (const point of entree.coordonnees) {
      if (!compatible(this.quartiers.contenant(point))) continue;
      if (rues.length && !rues.some((r) => GeometrieLocale.distance(r.trace.geometrie, point) <= 250)) continue;
      return { point, rayonMetres: 150, source: "Position de l'annonce" };
    }

    // 2. Rue et station : le point de la rue le plus proche de la station.
    let meilleur: { point: [number, number]; distance: number; rue: string; station: string } | undefined;
    for (const rue of rues) {
      for (const station of stations) {
        const proche = GeometrieLocale.contient(rue.trace.geometrie, station.position)
          ? { point: station.position, distance: 0 }
          : GeometrieLocale.plusProche(rue.trace.geometrie, station.position);
        if (!meilleur || proche.distance < meilleur.distance) meilleur = { ...proche, rue: rue.nom, station: station.nom };
      }
    }
    if (meilleur && meilleur.distance <= 1000) {
      return { point: meilleur.point, rayonMetres: 200, source: `${meilleur.rue}, côté station ${meilleur.station}` };
    }

    // 3. Station(s) seule(s) : déjà ce qui compte pour un trajet en transports.
    if (stations.length) {
      const point: [number, number] = [
        stations.reduce((s, x) => s + x.position[0], 0) / stations.length,
        stations.reduce((s, x) => s + x.position[1], 0) / stations.length,
      ];
      const ecart = Math.max(...stations.map((s) => GeometrieLocale.distanceEntre(point, s.position)));
      return { point, rayonMetres: Math.round(RAYON_STATION + ecart), source: `Près de ${this.liste(stations.map((s) => `la station ${s.nom}`))}` };
    }

    // 4. Rue(s) seule(s) : leur croisement si deux rues se touchent, sinon le milieu de la rue.
    for (const [i, a] of rues.entries()) {
      for (const b of rues.slice(i + 1)) {
        const croisement = this.croisement(a.trace.geometrie, b.trace.geometrie);
        if (croisement) return { point: croisement, rayonMetres: 100, source: `Croisement ${a.nom} / ${b.nom}` };
      }
    }
    if (rues.length) {
      const rue = rues[0];
      return { point: rue.trace.centre, rayonMetres: Math.round(Math.max(100, rue.trace.longueur / 2)), source: `${rue.nom} (milieu de la voie)` };
    }

    // 5. Centre du ou des quartiers retenus.
    const retenus = this.quartiers.quartiers.filter((q) => ids.has(q.id));
    const centre = GeometrieLocale.centre(retenus.map((q) => q.geometrie));
    if (!centre) return undefined;
    return {
      point: centre.point,
      rayonMetres: Math.round(centre.rayon),
      source: retenus.length === 1 ? `Centre du quartier ${retenus[0].nom}` : "Centre des quartiers possibles",
    };
  }

  private quartiersDeRue(rue: RueDetectee): Quartier[] {
    return [...new Map(rue.quartiers.flatMap((n) => this.quartiers.parNom(n)).map((q) => [q.id, q])).values()];
  }

  private croisement(a: GeometrieQuartier, b: GeometrieQuartier): [number, number] | undefined {
    let meilleur: { point: [number, number]; distance: number } | undefined;
    for (const sommet of GeometrieLocale.sommets(a)) {
      const distance = GeometrieLocale.distance(b, sommet);
      if (!meilleur || distance < meilleur.distance) meilleur = { point: sommet, distance };
    }
    return meilleur && meilleur.distance <= 30 ? meilleur.point : undefined;
  }

  private liste(elements: string[]): string {
    return elements.length <= 1 ? elements.join("") : `${elements.slice(0, -1).join(", ")} et ${elements[elements.length - 1]}`;
  }
}
