export type Position = [longitude: number, latitude: number];
export type Polygone = Position[][];
export type GeometrieQuartier =
  | { type: "Polygon"; coordinates: Polygone }
  | { type: "MultiPolygon"; coordinates: Polygone[] };

export interface Quartier {
  id: number;
  nom: string;
  arrondissement: number;
  geometrie: GeometrieQuartier;
}

/** Voie de Paris telle que publiée par la Ville (quartiers administratifs traversés). */
export interface Voie {
  nom: string;
  arrondissements: number[];
  quartiers: string[];
}

/** Arrêt d'une ligne (métro, RER, tram…) ; une station desservie par plusieurs lignes apparaît plusieurs fois. */
export interface Arret {
  nom: string;
  mode: string;
  ligne: string;
  position: Position;
}

/** Tracé d'une voie : emprise, centre et longueur en mètres. */
export interface TraceVoie {
  centre: Position;
  longueur: number;
  geometrie: GeometrieQuartier;
}

export interface RueDetectee {
  nom: string;
  quartiers: string[];
  trace?: TraceVoie;
}

export interface StationDetectee {
  nom: string;
  lignes: string[];
  position: Position;
}

export interface IndicesLocalisation {
  /** Site de l'annonce (« Jinka »…), pour citer la source du quartier affiché. */
  site?: string;
  quartier?: string;
  arrondissement?: number;
  coordonnees: Position[];
  /** Titre et description de l'annonce, où chercher rues et stations. */
  texte?: string;
  rues?: RueDetectee[];
  stations?: StationDetectee[];
  /** Vrai si les référentiels de rues et de stations n'ont pas pu être consultés. */
  lieuxIndisponibles?: boolean;
}

export interface IndiceResolu {
  type: "quartier" | "coordonnees" | "rue" | "station";
  libelle: string;
  source: string;
  quartiers: number[];
}

/** Meilleure position connue du logement, pour les calculs de trajet. */
export interface PositionEstimee {
  point: Position;
  rayonMetres: number;
  source: string;
}

export interface ResultatLocalisation {
  statut: "renseignee" | "estimee" | "ambigue" | "introuvable";
  quartiers: { id: number; nom: string; arrondissement: number }[];
  indices: IndiceResolu[];
  avertissements: string[];
  position?: PositionEstimee;
}
