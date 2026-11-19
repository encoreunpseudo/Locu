import type { Logement } from "./checkEncadrementLoyers";
import { ParseurAnnonce } from "./parseAnnonce";
import { ExtracteurLocalisationJinka } from "./localisation";

// Parseur des annonces Jinka (jinka.fr/ad/...)
// Structure observée sur exemplesJinka/ :
//   <h1>Paris 15e (75015)</h1>
//   sous le h1 : <p><span>Appartement</span>…<span><svg/>Grenelle</span></p>
//   <p>1 390 €</p>  puis  <span>35 m²</span> <span>2 pièces</span> <span>1 chambre</span>
//   <h2>Description</h2><p>… location non meublée … Charges mensuelles : 100€</p>
//   <h2>Caractéristiques</h2><ul><li>Dernier étage</li>…</ul>
// Les classes CSS (Tailwind) changent souvent : on repère les blocs par leur contenu et les h1/h2.
// Le titre de la page et le texte complet ne servent que de secours.
export class JinkaParseur extends ParseurAnnonce {
  private readonly localisation = new ExtracteurLocalisationJinka();

  peutParser(url: URL): boolean {
    return url.hostname === "jinka.fr" || url.hostname.endsWith(".jinka.fr");
  }

  parser(doc: Document): Logement {
    const h1 = doc.querySelector("h1")?.textContent ?? "";
    const description = this.blocApresTitre(doc, "Description");
    const caracteristiques = this.blocApresTitre(doc, "Caractéristiques");
    const infos = `${description}\n${caracteristiques}`;
    const secours = `${doc.title}\n${doc.body.innerText ?? doc.body.textContent}`;
    const indicesLocalisation = this.localisation.extraire(doc);

    // Le prix affiché par Jinka est charges comprises, l'encadrement porte sur le loyer hors charges
    const prix = this.extrairePrix(this.texteSeul(doc, /^\d[\d\s  ]*€$/) ?? doc.title);
    const charges = this.extraireCharges(description);

    return {
      quartier: indicesLocalisation.quartier,
      indicesLocalisation,
      arrondissement: this.extraireArrondissement(h1) ?? this.extraireArrondissement(secours),
      pieces: this.extrairePieces(this.texteSeul(doc, /^(\d+\s*pi[eè]ces?|studio)$/i) ?? doc.title),
      nbM2: this.extraireSurface(this.texteSeul(doc, /^\d+(?:[.,]\d+)?\s*m[²2]$/) ?? doc.title),
      // Sans montant de charges, le prix affiché est pris comme loyer hors charges : hypothèse signalée.
      prixMois: prix != null ? prix - (charges ?? 0) : undefined,
      chargesInconnues: prix != null && charges == null,
      meuble: this.extraireMeuble(infos) ?? this.extraireMeuble(doc.title),
      epoque: this.extraireEpoque(infos),
    };
  }

  // Premier <p>/<span> dont tout le texte correspond au motif (ex. le bloc "35 m²" seul)
  private texteSeul(doc: Document, motif: RegExp): string | undefined {
    for (const el of doc.querySelectorAll("p, span")) {
      const texte = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (motif.test(texte)) return texte;
    }
    return undefined;
  }

  // Contenu de l'élément qui suit le <h2> donné ("Description", "Caractéristiques")
  private blocApresTitre(doc: Document, titre: string): string {
    const h2 = [...doc.querySelectorAll("h2")].find((h) => h.textContent?.trim() === titre);
    const bloc = h2?.nextElementSibling;
    if (!bloc) return "";
    const items = bloc.querySelectorAll("li");
    return items.length ? [...items].map((li) => li.textContent?.trim()).join("\n") : bloc.textContent ?? "";
  }

}
