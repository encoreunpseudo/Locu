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

export interface Rue {
  id: string;
  nom: string;
  alias?: string[];
  lignes: Position[][];
}

export interface Station {
  id: string;
  nom: string;
  alias?: string[];
  positions: Position[];
}

export interface DonneesLieux {
  sources: { nom: string; url: string; licence: string; dateImport: string }[];
  rues: Rue[];
  stations: Station[];
}

export interface IndicesLocalisation {
  quartier?: string;
  arrondissement?: number;
  description: string;
  stations: string[];
  coordonnees: Position[];
}

export interface IndiceResolu {
  type: "quartier" | "rue" | "station" | "coordonnees";
  libelle: string;
  source: string;
  quartiers: number[];
  contraignant: boolean;
}

export interface ResultatLocalisation {
  statut: "renseignee" | "estimee" | "ambigue" | "introuvable";
  quartiers: { id: number; nom: string; arrondissement: number }[];
  indices: IndiceResolu[];
  avertissements: string[];
}
