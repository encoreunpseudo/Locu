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

export interface IndicesLocalisation {
  quartier?: string;
  arrondissement?: number;
  coordonnees: Position[];
}

export interface IndiceResolu {
  type: "quartier" | "coordonnees";
  libelle: string;
  source: string;
  quartiers: number[];
}

export interface ResultatLocalisation {
  statut: "renseignee" | "estimee" | "ambigue" | "introuvable";
  quartiers: { id: number; nom: string; arrondissement: number }[];
  indices: IndiceResolu[];
  avertissements: string[];
}
