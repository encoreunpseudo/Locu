import type { Logement } from "./checkEncadrementLoyers";
import { ParseurAnnonce } from "./parseAnnonce";
import { ExtracteurLocalisationLeboncoin } from "./localisation";

// Parseur des annonces de location Leboncoin (leboncoin.fr/ad/locations/...)
// Structure observée sur exemplesLBC/ :
//   <div data-qa-id="adview_title"><p>Appartement 36,50m2</p>… <div data-qa-id="adview_price"><p>1 700 €</p>
//   sous le prix : <p>Paris 75009 · Quartier Rochechouart · Voir le plan</p>
//   <div data-qa-id="adview_description_container"><p>…</p></div>
//   « Les informations clés » : <div data-qa-id="criteria_item_square">…<div title="Surface habitable">36.5 m²</div>
//     (clés furnished, square, rooms, building_year, charges_included…)
//   <h2>Détail du prix</h2> : « Loyer hors charges 1 540 € / mois », « Charges prévisionnelles 160 € / mois »
// Les data-qa-id servent aux tests de Leboncoin et changent moins que les classes CSS.
// Pas de JSON-LD ni de __NEXT_DATA__ exploitable : tout est lu dans le DOM rendu.
export class LeboncoinParseur extends ParseurAnnonce {
  private readonly localisation = new ExtracteurLocalisationLeboncoin();

  peutParser(url: URL): boolean {
    return (url.hostname === "leboncoin.fr" || url.hostname.endsWith(".leboncoin.fr"))
      && /^\/(?:ad\/)?locations\//.test(url.pathname);
  }

  parser(doc: Document): Logement {
    const titre = doc.querySelector('[data-qa-id="adview_title"] p')?.textContent ?? doc.title;
    const description = doc.querySelector('[data-qa-id="adview_description_container"]')?.textContent ?? "";
    const indicesLocalisation = this.localisation.extraire(doc);
    const pieces = Number(this.critere(doc, "rooms"));
    const annee = this.critere(doc, "building_year");

    return {
      quartier: indicesLocalisation.quartier,
      indicesLocalisation,
      arrondissement: indicesLocalisation.arrondissement ?? this.extraireArrondissement(`${titre}\n${description}`),
      pieces: Number.isInteger(pieces) && pieces > 0 ? pieces : this.extrairePieces(titre),
      nbM2: this.extraireSurface(this.critere(doc, "square") ?? titre),
      ...this.loyer(doc, description),
      meuble: this.extraireMeuble(this.critere(doc, "furnished") ?? "") ?? this.extraireMeuble(`${titre}\n${description}`),
      epoque: this.extraireEpoque(annee ? `Année de construction ${annee}` : description),
    };
  }

  // Leboncoin affiche le loyer charges comprises et, en général, son détail hors charges.
  private loyer(doc: Document, description: string): Pick<Logement, "prixMois" | "chargesInconnues"> {
    const horsCharges = this.montantDetail(doc, "Loyer hors charges");
    if (horsCharges != null) return { prixMois: horsCharges, chargesInconnues: false };
    const prix = this.extrairePrix(doc.querySelector('[data-qa-id="adview_price"] p')?.textContent ?? "");
    if (prix == null) return {};
    const charges = this.montantDetail(doc, "Charges prévisionnelles") ?? this.extraireCharges(description);
    if (charges != null) return { prixMois: prix - charges, chargesInconnues: false };
    // Sans montant de charges, le prix affiché est pris comme loyer hors charges : hypothèse signalée,
    // sauf si l'annonce précise que les charges ne sont pas incluses.
    return { prixMois: prix, chargesInconnues: this.critere(doc, "charges_included") !== "Non" };
  }

  // Valeur d'un critère de « Les informations clés » (data-qa-id="criteria_item_<cle>")
  private critere(doc: Document, cle: string): string | undefined {
    const valeur = doc.querySelector(`[data-qa-id="criteria_item_${cle}"] [title]`)?.textContent;
    return valeur?.replace(/\s+/g, " ").trim() || undefined;
  }

  // Montant de la ligne « libellé … 1 540 € / mois » de la section « Détail du prix »
  private montantDetail(doc: Document, libelle: string): number | undefined {
    const h2 = [...doc.querySelectorAll("h2")].find((h) => h.textContent?.trim() === "Détail du prix");
    const section = h2?.closest("section") ?? h2?.parentElement;
    const etiquette = [...(section?.querySelectorAll("p, span") ?? [])].find((el) => el.textContent?.trim() === libelle);
    let ligne = etiquette?.parentElement;
    while (ligne && ligne !== section && !ligne.textContent?.includes("€")) ligne = ligne.parentElement;
    return ligne && ligne !== section ? this.extrairePrix(ligne.textContent ?? "") : undefined;
  }
}
