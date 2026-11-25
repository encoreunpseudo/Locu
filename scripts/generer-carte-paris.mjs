// Génère assets/paris.svg, la carte de Paris affichée en fond de la popup et des options.
// Données © contributeurs OpenStreetMap (ODbL), téléchargées depuis l'API Overpass.
// Usage : node scripts/generer-carte-paris.mjs <dossier-cache>
// Le dossier de cache garde les réponses Overpass : relancer le script ne retélécharge rien.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const cache = process.argv[2];
if (!cache) {
  console.error("Usage : node scripts/generer-carte-paris.mjs <dossier-cache>");
  process.exit(1);
}
mkdirSync(cache, { recursive: true });

const BBOX = "48.81,2.22,48.905,2.47";
const REQUETES = {
  routes: `[out:json][timeout:120];way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${BBOX});out geom qt;`,
  seine: `[out:json][timeout:90];rel["water"="river"]["name"~"Seine"](${BBOX});out geom qt;`,
  limite: `[out:json][timeout:60];relation(7444);out geom qt;`, // commune de Paris
};

// L'API Overpass répond souvent 502/504 quand elle est chargée : on réessaie.
async function telecharger(nom) {
  const fichier = join(cache, `${nom}.json`);
  if (!existsSync(fichier)) {
    for (let essai = 1; ; essai++) {
      const r = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: new URLSearchParams({ data: REQUETES[nom] }),
      });
      if (r.ok) { writeFileSync(fichier, await r.text()); break; }
      if (essai === 5) throw new Error(`Overpass ${nom} : HTTP ${r.status}`);
      await new Promise((ok) => setTimeout(ok, 20_000));
    }
  }
  return JSON.parse(readFileSync(fichier, "utf8")).elements;
}

const [routes, seine, [limite]] = await Promise.all(Object.keys(REQUETES).map(telecharger));

// Projection équirectangulaire centrée sur Paris : suffisante à cette échelle.
const LARGEUR = 1000;
const [S, O, N, E] = BBOX.split(",").map(Number);
const cosLat = Math.cos(((S + N) / 2) * Math.PI / 180);
const k = LARGEUR / ((E - O) * cosLat);
const HAUTEUR = Math.round((N - S) * k);
const projeter = ({ lat, lon }) => [(lon - O) * cosLat * k, (N - lat) * k];

// Douglas-Peucker : retire les points qui s'écartent de moins de `tol` du segment.
function simplifier(pts, tol) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    // Anneau fermé : extrémités confondues, on mesure la distance au point de départ.
    const d = l ? Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / l
      : Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplifier(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplifier(pts.slice(idx), tol)];
}

const chemin = (pts, ferme = false) =>
  "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + (ferme ? "Z" : "");

// Les multipolygones OSM arrivent en morceaux de chemins : on les recolle en anneaux fermés.
function anneaux(relation, role = "outer") {
  const morceaux = relation.members.filter((m) => m.type === "way" && m.role === role && m.geometry).map((m) => m.geometry);
  const cle = (p) => `${p.lat},${p.lon}`;
  const resultat = [];
  while (morceaux.length) {
    let anneau = morceaux.shift();
    while (cle(anneau[0]) !== cle(anneau[anneau.length - 1])) {
      const fin = cle(anneau[anneau.length - 1]);
      const i = morceaux.findIndex((m) => cle(m[0]) === fin || cle(m[m.length - 1]) === fin);
      if (i < 0) break;
      const [m] = morceaux.splice(i, 1);
      anneau = anneau.concat(cle(m[0]) === fin ? m.slice(1) : m.slice(0, -1).reverse());
    }
    resultat.push(anneau);
  }
  return resultat;
}

const polygone = (relations) => relations.flatMap((r) =>
  [...anneaux(r, "outer"), ...anneaux(r, "inner")].map((a) => chemin(simplifier(a.map(projeter), 0.4), true))).join("");

const contour = polygone([limite]);
const eau = polygone(seine);

const CLASSES = { motorway: "a", trunk: "a", primary: "b", secondary: "c", tertiary: "d" };
const traits = { a: [], b: [], c: [], d: [] };
for (const w of routes) {
  const classe = CLASSES[w.tags?.highway];
  if (!classe || !w.geometry) continue;
  const pts = simplifier(w.geometry.map(projeter), 0.5);
  if (pts.length > 1) traits[classe].push(chemin(pts));
}

// Couleur noire unique : la popup utilise ce SVG comme masque et choisit elle-même la couleur.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGEUR} ${HAUTEUR}">
<!-- Données © contributeurs OpenStreetMap, ODbL (openstreetmap.org/copyright) -->
<defs><clipPath id="paris"><path d="${contour}" clip-rule="evenodd"/></clipPath></defs>
<g clip-path="url(#paris)" fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round">
<path d="${eau}" fill="#000" fill-rule="evenodd" stroke="none" opacity=".55"/>
<path d="${traits.d.join("")}" stroke-width=".6" opacity=".7"/>
<path d="${traits.c.join("")}" stroke-width=".9"/>
<path d="${traits.b.join("")}" stroke-width="1.4"/>
<path d="${traits.a.join("")}" stroke-width="2.2"/>
</g>
<path d="${contour}" fill="none" stroke="#000" stroke-width="1.2"/>
</svg>
`;
mkdirSync("assets", { recursive: true });
writeFileSync("assets/paris.svg", svg);
console.log(`assets/paris.svg : ${(svg.length / 1024).toFixed(0)} Ko, ${LARGEUR}×${HAUTEUR}`);
