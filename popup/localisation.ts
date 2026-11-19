// Point d'entrée public ; chaque classe possède une seule responsabilité.
export { DepotLocalisation } from "./localisation/DepotLocalisation";
export { ExtracteurLocalisationJinka } from "./localisation/ExtracteurLocalisationJinka";
export { LecteurJsonLd } from "./localisation/LecteurJsonLd";
export { NormaliseurLieu } from "./localisation/NormaliseurLieu";
export { GeometrieLocale } from "./localisation/GeometrieLocale";
export { ReferentielQuartiers } from "./localisation/ReferentielQuartiers";
export { ResolveurLocalisation } from "./localisation/ResolveurLocalisation";
export type * from "./localisation/types";
