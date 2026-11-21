import type { Position } from "../localisation/types";
import type { Etape, Itineraire } from "./types";

type Requete = (url: string, init: { headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface Section {
  type?: string;
  mode?: string;
  duration?: number;
  display_informations?: { commercial_mode?: string; code?: string; color?: string; text_color?: string; direction?: string };
  links?: { id?: string; type?: string }[];
  departure_date_time?: string;
  arrival_date_time?: string;
  from?: { name?: string };
  to?: { name?: string };
  stop_date_times?: unknown[];
}
interface Trajet {
  duration?: number;
  nb_transfers?: number;
  durations?: { walking?: number };
  sections?: Section[];
}

const URL_ITINERAIRES = "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/journeys";

/** Erreur PRIM typée : la page d'options distingue une clé refusée d'un réseau coupé. */
export class ErreurPrim extends Error {
  constructor(message: string, readonly code: "absente" | "refusee" | "quota" | "reseau" | "aucun") {
    super(message);
  }
}

/** Calculateur d'itinéraires d'Île-de-France Mobilités (PRIM, moteur Navitia), avec la clé de l'utilisateur. */
export class ClientPrim {
  constructor(private readonly cle: string, private readonly requete: Requete = (url, init) => fetch(url, init)) {}

  /** `depart` au format Navitia, heure de Paris : AAAAMMJJTHHMMSS. */
  async itineraire(depart: Position, arrivee: Position, dateDepart: string): Promise<Itineraire> {
    if (!this.cle) throw new ErreurPrim("Clé PRIM absente", "absente");
    const point = ([lon, lat]: Position) => `${lon.toFixed(6)};${lat.toFixed(6)}`;
    const url = `${URL_ITINERAIRES}?from=${point(depart)}&to=${point(arrivee)}&datetime=${dateDepart}&count=1`;
    let reponse: Awaited<ReturnType<Requete>>;
    try {
      reponse = await this.requete(url, { headers: { apikey: this.cle } });
    } catch {
      throw new ErreurPrim("PRIM injoignable", "reseau");
    }
    if (reponse.status === 401 || reponse.status === 403) throw new ErreurPrim("Clé PRIM refusée", "refusee");
    if (reponse.status === 429) throw new ErreurPrim("Quota PRIM dépassé, réessaie plus tard", "quota");
    const corps = await reponse.json().catch(() => ({})) as { journeys?: Trajet[] };
    const trajet = corps.journeys?.[0];
    if (!reponse.ok || typeof trajet?.duration !== "number") throw new ErreurPrim("Aucun itinéraire trouvé", "aucun");

    const sections = trajet.sections ?? [];
    const premierTransport = sections.findIndex((s) => s.type === "public_transport");
    const avant = premierTransport === -1 ? sections : sections.slice(0, premierTransport);
    const marcheDepart = premierTransport === -1
      ? trajet.duration
      : avant.filter((s) => s.type === "street_network").reduce((total, s) => total + (s.duration ?? 0), 0);
    const lignes = sections.filter((s) => s.type === "public_transport").map((s) =>
      [s.display_informations?.commercial_mode, s.display_informations?.code].filter(Boolean).join(" "));
    return {
      duree: trajet.duration,
      marcheDepart,
      marche: trajet.durations?.walking ?? marcheDepart,
      correspondances: trajet.nb_transfers ?? Math.max(0, lignes.length - 1),
      lignes: [...new Set(lignes.filter(Boolean))],
      etapes: this.etapes(sections),
    };
  }

  /**
   * Marche (y compris les correspondances à pied) et lignes empruntées, dans l'ordre, avec stations et horaires.
   * L'attente sur le quai est comptée dans la ligne qui suit ; les marches de moins de 30 s disparaissent.
   */
  private etapes(sections: Section[]): Etape[] {
    const etapes: Etape[] = [];
    let marche: Section[] = [];
    let attente = 0;
    const finirMarche = () => {
      const duree = marche.reduce((total, s) => total + (s.duration ?? 0), 0);
      if (duree >= 30) {
        etapes.push({
          type: "marche",
          minutes: Math.max(1, Math.round(duree / 60)),
          // Entre deux lignes : correspondance ; avant la première ou après la dernière : simple marche.
          correspondance: etapes.length > 0 && sections.indexOf(marche[marche.length - 1]) < this.dernierTransport(sections),
          heureDebut: this.heure(marche[0].departure_date_time),
          heureFin: this.heure(marche[marche.length - 1].arrival_date_time),
        });
      }
      marche = [];
    };
    for (const section of sections) {
      const duree = section.duration ?? 0;
      if (section.type === "public_transport") {
        finirMarche();
        const infos = section.display_informations ?? {};
        const ligne = section.links?.find((l) => l.type === "line")?.id?.match(/^line:IDFM:(C\d+)$/)?.[1];
        etapes.push({
          type: "transport",
          minutes: Math.max(1, Math.round((duree + attente) / 60)),
          attente: Math.round(attente / 60),
          ligneId: ligne,
          mode: infos.commercial_mode ?? "",
          code: infos.code ?? "",
          couleur: this.couleur(infos.color),
          couleurTexte: this.couleur(infos.text_color),
          direction: this.nomLieu(infos.direction),
          depart: this.nomLieu(section.from?.name),
          arrivee: this.nomLieu(section.to?.name),
          arrets: Array.isArray(section.stop_date_times) && section.stop_date_times.length > 1 ? section.stop_date_times.length - 1 : undefined,
          heureDebut: this.heure(section.departure_date_time),
          heureFin: this.heure(section.arrival_date_time),
        });
        attente = 0;
      } else if (section.type === "waiting") {
        attente += duree;
      } else if (section.type === "street_network" || section.type === "transfer" || section.type === "crow_fly") {
        marche.push(section);
      }
    }
    finirMarche();
    return etapes;
  }

  private dernierTransport(sections: Section[]): number {
    return sections.map((s) => s.type).lastIndexOf("public_transport");
  }

  // « Charles Michels (Paris) » → « Charles Michels » : la commune entre parenthèses n'apporte rien ici.
  private nomLieu(nom?: string): string | undefined {
    return nom?.replace(/\s*\([^()]*\)$/, "").trim() || undefined;
  }

  // « 20261123T083423 » → « 8:34 »
  private heure(valeur?: string): string | undefined {
    const m = valeur?.match(/T(\d{2})(\d{2})/);
    return m ? `${Number(m[1])}:${m[2]}` : undefined;
  }

  // Les couleurs finissent dans un attribut style : n'accepter qu'un hexadécimal strict.
  private couleur(valeur?: string): string | undefined {
    return valeur && /^[0-9a-f]{6}$/i.test(valeur) ? valeur : undefined;
  }
}
