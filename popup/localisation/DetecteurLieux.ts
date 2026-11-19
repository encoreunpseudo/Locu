import { NormaliseurLieu } from "./NormaliseurLieu";
import type { Arret, Position, RueDetectee, StationDetectee, Voie } from "./types";

interface StationGroupee extends StationDetectee {
  noms: string[];
}

/** Repère, dans le texte d'une annonce, les voies et stations connues des référentiels. Aucun accès réseau. */
export class DetecteurLieux {
  // Mots qui annoncent une station ; la recherche se fait dans une courte fenêtre qui commence par eux.
  // « M° » devient « m » une fois normalisé, mais « 35 m² » aussi : un « m » précédé d'un nombre ne compte pas.
  private static readonly MOTS_STATION = /(?:^| )(?:metros?|stations?|rer|tram|tramway|gares?|arrets?|lignes?|(?<![0-9] )m)(?= )/g;
  private static readonly FENETRE = 60;

  private readonly voiesNormalisees: { voie: Voie; nom: string }[];
  private readonly stationsGroupees: StationGroupee[];

  constructor(voies: readonly Voie[], arrets: readonly Arret[]) {
    this.voiesNormalisees = voies.map((voie) => ({ voie, nom: NormaliseurLieu.normaliser(voie.nom) }));
    this.stationsGroupees = this.grouper(arrets);
  }

  detecter(texte: string, arrondissement?: number): { rues: RueDetectee[]; stations: StationDetectee[] } {
    const normalise = NormaliseurLieu.normaliser(texte);
    return { rues: this.rues(normalise, arrondissement), stations: this.stations(normalise) };
  }

  private rues(texte: string, arrondissement?: number): RueDetectee[] {
    const trouvees = this.voiesNormalisees.filter(({ voie, nom }) =>
      nom.includes(" ") && (` ${texte} `).includes(` ${nom} `) &&
      (arrondissement == null || !voie.arrondissements.length || voie.arrondissements.includes(arrondissement)));
    // « rue de la Paix » ne compte pas si seule « rue de la Paix prolongée » est citée.
    return trouvees
      .filter((a) => !trouvees.some((b) => b !== a && b.nom.length > a.nom.length && (` ${b.nom} `).includes(` ${a.nom} `)))
      .map(({ voie }) => ({ nom: voie.nom, quartiers: voie.quartiers }));
  }

  private stations(texte: string): StationDetectee[] {
    const fenetres = [...texte.matchAll(DetecteurLieux.MOTS_STATION)]
      .map((m) => ` ${texte.slice(m.index!, m.index! + m[0].length + DetecteurLieux.FENETRE)} `);
    if (!fenetres.length) return [];
    return this.stationsGroupees
      .filter((s) => s.noms.some((nom) => fenetres.some((f) => f.includes(` ${nom} `))))
      .map(({ nom, lignes, position }) => ({ nom, lignes, position }));
  }

  /** Une entrée par station (toutes lignes confondues), avec ses variantes de nom. */
  private grouper(arrets: readonly Arret[]): StationGroupee[] {
    const parNom = new Map<string, Arret[]>();
    for (const arret of arrets) {
      const cle = NormaliseurLieu.normaliser(arret.nom);
      if (cle) parNom.set(cle, [...(parNom.get(cle) ?? []), arret]);
    }
    return [...parNom].map(([cle, groupe]) => {
      const position: Position = [
        groupe.reduce((s, a) => s + a.position[0], 0) / groupe.length,
        groupe.reduce((s, a) => s + a.position[1], 0) / groupe.length,
      ];
      // « Javel - André Citroën » se cite aussi « Javel » ; les fragments trop courts sont écartés.
      const variantes = groupe[0].nom.split(/\s+-\s+/).map((v) => NormaliseurLieu.normaliser(v)).filter((v) => v.length >= 5);
      return {
        nom: groupe[0].nom,
        lignes: [...new Set(groupe.map((a) => `${a.mode} ${a.ligne}`.trim()))],
        position,
        noms: [...new Set([cle, ...variantes])],
      };
    });
  }
}
