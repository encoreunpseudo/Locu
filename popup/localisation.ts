// Point d'entrée public ; chaque classe possède une seule responsabilité.
export { DepotLocalisation } from "./localisation/DepotLocalisation";
export { DetecteurLieux } from "./localisation/DetecteurLieux";
export { ExtracteurLocalisationJinka } from "./localisation/ExtracteurLocalisationJinka";
export { ExtracteurLocalisationLeboncoin } from "./localisation/ExtracteurLocalisationLeboncoin";
export { LecteurJsonLd, type IdentifiantAnnonce } from "./localisation/LecteurJsonLd";
export { NormaliseurLieu } from "./localisation/NormaliseurLieu";
export { GeometrieLocale } from "./localisation/GeometrieLocale";
export { ReferentielQuartiers } from "./localisation/ReferentielQuartiers";
export { ResolveurLocalisation } from "./localisation/ResolveurLocalisation";
export { SourcesLieux, type Stockage } from "./localisation/SourcesLieux";
export type * from "./localisation/types";
