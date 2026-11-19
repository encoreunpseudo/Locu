import type { GeometrieQuartier, Polygone, Position } from "./types";

/** Appartenance d'un point à un quartier ; distances planaires en mètres, à l'échelle de Paris. */
export class GeometrieLocale {
  private static readonly METRES_LATITUDE = 111_320;
  private static readonly METRES_LONGITUDE = 111_320 * Math.cos(48.8566 * Math.PI / 180);

  static positionValide(position: unknown): position is Position {
    return Array.isArray(position) && position.length === 2 &&
      position.every((n) => typeof n === "number" && Number.isFinite(n)) &&
      Math.abs(position[0]) <= 180 && Math.abs(position[1]) <= 90;
  }

  static contient(geometrie: GeometrieQuartier, point: Position): boolean {
    return this.polygones(geometrie).some((p) =>
      // Une frontière appartient aux deux quartiers : ne pas en choisir un arbitrairement.
      p.some((anneau) => [...this.segments(anneau)].some(([a, b]) => this.projection(point, a, b).distance < 0.01)) ||
      (this.dansAnneau(point, p[0]) && !p.slice(1).some((trou) => this.dansAnneau(point, trou)))
    );
  }

  /** Distance en mètres entre un point et une géométrie (0 à l'intérieur). */
  static distance(geometrie: GeometrieQuartier, point: Position): number {
    return this.contient(geometrie, point) ? 0 : this.plusProche(geometrie, point).distance;
  }

  /** Point du contour le plus proche, et sa distance en mètres. */
  static plusProche(geometrie: GeometrieQuartier, point: Position): { point: Position; distance: number } {
    let meilleur = { point, distance: Infinity };
    for (const p of this.polygones(geometrie)) {
      for (const anneau of p) {
        for (const [a, b] of this.segments(anneau)) {
          const candidat = this.projection(point, a, b);
          if (candidat.distance < meilleur.distance) meilleur = candidat;
        }
      }
    }
    return meilleur;
  }

  static distanceEntre(a: Position, b: Position): number {
    return Math.hypot((a[0] - b[0]) * this.METRES_LONGITUDE, (a[1] - b[1]) * this.METRES_LATITUDE);
  }

  /** Centre des sommets et rayon qui les englobe tous : ordre de grandeur, pas un centroïde exact. */
  static centre(geometries: readonly GeometrieQuartier[]): { point: Position; rayon: number } | undefined {
    const sommets = geometries.flatMap((g) => this.polygones(g).flatMap((p) => p[0]));
    if (!sommets.length) return undefined;
    const xs = sommets.map((s) => s[0]);
    const ys = sommets.map((s) => s[1]);
    const point: Position = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    return { point, rayon: Math.max(...sommets.map((s) => this.distanceEntre(point, s))) };
  }

  static sommets(geometrie: GeometrieQuartier): Position[] {
    return this.polygones(geometrie).flatMap((p) => p.flat());
  }

  private static polygones(g: GeometrieQuartier): Polygone[] {
    return g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  }

  private static *segments(ligne: Position[]): Generator<[Position, Position]> {
    for (let i = 1; i < ligne.length; i++) yield [ligne[i - 1], ligne[i]];
  }

  private static dansAnneau([x, y]: Position, anneau: Position[]): boolean {
    let dedans = false;
    for (const [[ax, ay], [bx, by]] of this.segments(anneau)) {
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) dedans = !dedans;
    }
    return dedans;
  }

  private static projection(point: Position, debut: Position, fin: Position): { point: Position; distance: number } {
    const x = (point[0] - debut[0]) * this.METRES_LONGITUDE;
    const y = (point[1] - debut[1]) * this.METRES_LATITUDE;
    const dx = (fin[0] - debut[0]) * this.METRES_LONGITUDE;
    const dy = (fin[1] - debut[1]) * this.METRES_LATITUDE;
    const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy)));
    return {
      point: [debut[0] + t * (fin[0] - debut[0]), debut[1] + t * (fin[1] - debut[1])],
      distance: Math.hypot(x - t * dx, y - t * dy),
    };
  }
}
