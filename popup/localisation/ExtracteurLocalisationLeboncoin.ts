import { NormaliseurLieu } from "./NormaliseurLieu";
import type { IndicesLocalisation } from "./types";

export class ExtracteurLocalisationLeboncoin {
  extraire(doc: Document): IndicesLocalisation {
    // Ligne « Paris 75009 · Quartier Rochechouart · Voir le plan » sous le prix :
    // la section « Localisation » plus bas n'est pas toujours rendue.
    const ligne = [...doc.querySelectorAll('[data-qa-id="adview_spotlight_description_container"] p')]
      .map((p) => p.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .find((t) => /\b75\d{3}\b/.test(t)) ?? "";
    const quartier = ligne.split(" · ").find((t) => t.startsWith("Quartier "))?.slice("Quartier ".length).trim();
    // Rues et stations sont cherchées dans le titre et la description rédigés par l'annonceur,
    // puis dans l'encart « Transports à proximité », placé en dernier pour que la fenêtre de
    // recherche après « Métro » ne déborde pas sur la description.
    const texte = [
      ...['[data-qa-id="adview_title"] p', '[data-qa-id="adview_description_container"]']
        .map((s) => doc.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim()),
      this.transports(doc),
    ].filter(Boolean).join("\n");
    return {
      site: "Leboncoin",
      quartier: quartier || undefined,
      arrondissement: NormaliseurLieu.arrondissement(ligne.match(/\b75\d{3}\b/)?.[0]),
      // Leboncoin ne publie ni JSON-LD ni coordonnées : la carte n'est qu'une image.
      coordonnees: [],
      texte: texte || undefined,
    };
  }

  // Encart de la section « Localisation » : une ligne par arrêt,
  // <span>Métro</span><span><img alt="Métro 7"></span><span>Poissonnière</span> → « Métro Poissonnière »
  // La section n'est rendue qu'une fois approchée au défilement : absente si la page n'a pas été parcourue.
  private transports(doc: Document): string | undefined {
    const titre = [...doc.querySelectorAll("p")].find((p) => p.textContent?.trim() === "Transports à proximité");
    const encart = titre?.closest('[data-spark-component="collapsible"]');
    const arrets = [...(encart?.querySelectorAll("div") ?? [])].flatMap((ligne) => {
      const spans = [...ligne.children].filter((e) => e.tagName === "SPAN");
      if (spans.length < 2 || spans.length !== ligne.children.length) return [];
      const [mode, nom] = [spans[0], spans[spans.length - 1]].map((s) => s.textContent?.replace(/\s+/g, " ").trim() ?? "");
      return mode && nom && mode !== nom ? [`${mode} ${nom}`] : [];
    });
    return arrets.length ? `Transports à proximité : ${arrets.join(" ; ")}` : undefined;
  }
}
