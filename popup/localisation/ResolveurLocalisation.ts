import { ReferentielQuartiers } from "./ReferentielQuartiers";
import type { IndiceResolu, IndicesLocalisation, Quartier, ResultatLocalisation } from "./types";

const resume = ({ id, nom, arrondissement }: Quartier) => ({ id, nom, arrondissement });

export class ResolveurLocalisation {
  constructor(private readonly quartiers: ReferentielQuartiers) {}

  resoudre(entree: IndicesLocalisation): ResultatLocalisation {
    const indices: IndiceResolu[] = [];
    const avertissements: string[] = [];
    const base = entree.arrondissement != null ? this.quartiers.parArrondissement(entree.arrondissement) : [];
    const dansBase = (q: Quartier) => entree.arrondissement == null || q.arrondissement === entree.arrondissement;

    // 1. Le quartier affiché par Jinka suffit.
    if (entree.quartier) {
      const trouves = this.quartiers.parNom(entree.quartier);
      indices.push({ type: "quartier", libelle: entree.quartier, source: "Quartier affiché par Jinka", quartiers: trouves.map((q) => q.id) });
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

    // 2. À défaut, la position de l'annonce (JSON-LD) dans les polygones du barème.
    const contenants = new Map<number, Quartier>();
    for (const position of entree.coordonnees) {
      const trouves = this.quartiers.contenant(position).filter(dansBase);
      indices.push({ type: "coordonnees", libelle: position.join(", "), source: "Position de l'annonce (JSON-LD)", quartiers: trouves.map((q) => q.id) });
      for (const q of trouves) contenants.set(q.id, q);
    }
    if (contenants.size === 1) {
      avertissements.push("Quartier déduit de la position approximative de l'annonce.");
      return { statut: "estimee", quartiers: [...contenants.values()].map(resume), indices, avertissements };
    }

    // 3. Sinon, tous les quartiers de l'arrondissement.
    const candidats = contenants.size > 1 ? [...contenants.values()] : base;
    return {
      statut: candidats.length ? "ambigue" : "introuvable",
      quartiers: [...candidats].sort((a, b) => a.id - b.id).map(resume),
      indices,
      avertissements,
    };
  }
}
