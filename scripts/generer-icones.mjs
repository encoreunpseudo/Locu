// Génère les icônes de l'extension (assets/icones-extension/) à partir du plan de Paris (assets/paris.svg).
// Usage : node scripts/generer-icones.mjs   (nécessite rsvg-convert : brew install librsvg)
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const carte = readFileSync("assets/paris.svg", "utf8");
const attribut = (re) => carte.match(re)?.[1] ?? "";
const contour = attribut(/<clipPath id="paris"><path d="([^"]*)"/);
const eau = attribut(/<path d="([^"]*)" fill="#000" fill-rule="evenodd"/);
const axe = (largeur) => attribut(new RegExp(`<path d="([^"]*)" stroke-width="${largeur}"`));
const grandsAxes = axe("2.2"), axesPrincipaux = axe("1.4"), axesSecondaires = axe("\\.9");

// Grandes tailles : cadre sur Paris intra-muros (coordonnées de paris.svg), les bois débordent du carré.
// Petites tailles : la ville entière, bois compris, pour garder une silhouette lisible.
const nombres = contour.match(/-?\d+(\.\d+)?/g).map(Number);
const xs = nombres.filter((_, i) => i % 2 === 0), ys = nombres.filter((_, i) => i % 2 === 1);
const CADRE_ENTIER = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
const CADRE_INTRA_MUROS = [125, 795, 85, 475]; // centré sur la hauteur de la ville (y de 17 à 544)

/**
 * Carré arrondi bleu, plan de Paris en blanc. Aux petites tailles, seuls le contour et la Seine
 * restent : les rues deviendraient une bouillie de pixels.
 */
function icone(taille) {
  const detaille = taille >= 48;
  const [x0, x1, y0, y1] = detaille ? CADRE_INTRA_MUROS : CADRE_ENTIER;
  const marge = taille * (detaille ? 0.12 : 0.04);
  const echelle = (taille - 2 * marge) / (x1 - x0);
  const decalageY = (taille - (y1 - y0) * echelle) / 2;
  const trait = (px) => (px / echelle).toFixed(2); // épaisseur en pixels de l'icône
  const rues = detaille ? `<g clip-path="url(#p)" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
    <path d="${axesSecondaires}" stroke-width="${trait(taille / 220)}" opacity=".3"/>
    <path d="${axesPrincipaux}" stroke-width="${trait(taille / 150)}" opacity=".45"/>
    <path d="${grandsAxes}" stroke-width="${trait(taille / 110)}" opacity=".6"/></g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 ${taille} ${taille}">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a74f2"/><stop offset="1" stop-color="#1d44b0"/></linearGradient>
    <clipPath id="p"><path d="${contour}"/></clipPath>
  </defs>
  <clipPath id="c"><rect width="${taille}" height="${taille}" rx="${taille * 0.22}"/></clipPath>
  <rect width="${taille}" height="${taille}" rx="${taille * 0.22}" fill="url(#f)"/>
  <g clip-path="url(#c)"><g transform="translate(${marge - x0 * echelle} ${decalageY - y0 * echelle}) scale(${echelle})">
    <path d="${contour}" fill="#fff" fill-opacity="${detaille ? 0.1 : 0.22}"/>
    ${rues}
    <path d="${eau}" fill="#a9c7ff" clip-path="url(#p)"/>
    <path d="${contour}" fill="none" stroke="#fff" stroke-width="${trait(detaille ? taille / 64 : 1.5)}" stroke-linejoin="round"/>
  </g></g>
</svg>
`;
}

mkdirSync("assets/icones-extension", { recursive: true });
for (const taille of [16, 32, 48, 128]) {
  const svg = `assets/icones-extension/.icone-${taille}.svg`;
  writeFileSync(svg, icone(taille));
  execFileSync("rsvg-convert", ["-w", String(taille), "-h", String(taille), "-o", `assets/icones-extension/icone-${taille}.png`, svg]);
  execFileSync("rm", [svg]);
}
console.log("Icônes écrites dans assets/icones-extension/");
