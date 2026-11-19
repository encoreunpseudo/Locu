import type { GeometrieQuartier, Polygone, Position } from "./types";

/** Calculs planaires en mètres, adaptés à l'échelle de Paris (aucun routage réseau). */
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
      p.some((anneau) => [...this.segments(anneau)].some(([a, b]) => this.distanceSegment(point, a, b) < 0.01)) ||
      (this.dansAnneau(point, p[0]) && !p.slice(1).some((trou) => this.dansAnneau(point, trou)))
    );
  }

  static distanceAuQuartier(point: Position, geometrie: GeometrieQuartier): number {
    if (this.contient(geometrie, point)) return 0;
    let distance = Infinity;
    for (const polygone of this.polygones(geometrie)) {
      for (const anneau of polygone) {
        for (const [a, b] of this.segments(anneau)) distance = Math.min(distance, this.distanceSegment(point, a, b));
      }
    }
    return distance;
  }

  static croiseRue(geometrie: GeometrieQuartier, lignes: Position[][], margeMetres = 30): boolean {
    // La marge conserve les deux côtés d'une voie située sur une limite de quartier.
    for (const ligne of lignes) {
      if (ligne.some((p) => this.distanceAuQuartier(p, geometrie) <= margeMetres)) return true;
      for (const [a, b] of this.segments(ligne)) {
        for (const polygone of this.polygones(geometrie)) {
          for (const anneau of polygone) {
            for (const [c, d] of this.segments(anneau)) {
              if (this.seCroisent(a, b, c, d) ||
                Math.min(this.distanceSegment(c, a, b), this.distanceSegment(d, a, b)) <= margeMetres) return true;
            }
          }
        }
      }
    }
    return false;
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

  private static distanceSegment(point: Position, debut: Position, fin: Position): number {
    const x = (point[0] - debut[0]) * this.METRES_LONGITUDE;
    const y = (point[1] - debut[1]) * this.METRES_LATITUDE;
    const dx = (fin[0] - debut[0]) * this.METRES_LONGITUDE;
    const dy = (fin[1] - debut[1]) * this.METRES_LATITUDE;
    const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - t * dx, y - t * dy);
  }

  private static seCroisent(a: Position, b: Position, c: Position, d: Position): boolean {
    const orientation = (p: Position, q: Position, r: Position) =>
      (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
  }
}
