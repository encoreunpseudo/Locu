import type { Position } from "../localisation/types";

/** Adresse enregistrée par l'utilisateur dans les options (travail, université…). */
export interface Lieu {
  id: string;
  nom: string;
  adresse: string;
  position: Position;
}

/** Horaires au format « 8:34 », heure de Paris. */
interface Horaires {
  heureDebut?: string;
  heureFin?: string;
}

/** Étape du trajet : marche, puis ligne, puis marche… Durées en minutes. */
export type Etape =
  | (Horaires & {
    type: "marche";
    minutes: number;
    /** Vrai pour une correspondance à pied entre deux lignes. */
    correspondance: boolean;
  })
  | (Horaires & {
    type: "transport";
    /** Trajet à bord plus l'attente sur le quai. */
    minutes: number;
    attente: number;
    /** Identifiant IDFM de la ligne (ex. « C01380 »), qui nomme aussi son pictogramme. */
    ligneId?: string;
    mode: string;
    code: string;
    /** Couleurs hexadécimales sans « # », pour les lignes sans pictogramme (bus…). */
    couleur?: string;
    couleurTexte?: string;
    direction?: string;
    depart?: string;
    arrivee?: string;
    /** Nombre d'arrêts parcourus (sans compter celui de départ). */
    arrets?: number;
  });

/** Meilleur itinéraire en transports en commun ; durées en secondes. */
export interface Itineraire {
  duree: number;
  /** Marche du départ jusqu'au premier arrêt (toute la durée si le trajet se fait à pied). */
  marcheDepart: number;
  marche: number;
  correspondances: number;
  /** Ex. « Métro 10 », « RER C » ; vide si le trajet se fait à pied. */
  lignes: string[];
  etapes: Etape[];
}

export interface TempsTrajet {
  lieu: Lieu;
  itineraire?: Itineraire;
  minMinutes?: number;
  maxMinutes?: number;
  erreur?: string;
}
