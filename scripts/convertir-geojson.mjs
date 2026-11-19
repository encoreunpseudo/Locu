const positionValide = (p) => Array.isArray(p) && p.length >= 2 &&
  p.slice(0, 2).every((n) => typeof n === "number" && Number.isFinite(n)) &&
  p[0] >= 1 && p[0] <= 4 && p[1] >= 48 && p[1] <= 50;

function lireChamp(proprietes, noms) {
  for (const nom of noms) {
    const valeur = proprietes[nom] ?? proprietes[nom.toUpperCase()];
    if (valeur != null && String(valeur).trim()) return String(valeur).trim();
  }
  return undefined;
}

/** Import strict : aucun export vide, aucune projection Lambert interprétée comme longitude/latitude. */
export function convertirGeoJson(contenu, type, champNom) {
  if (contenu?.type !== "FeatureCollection" || !Array.isArray(contenu.features) || !contenu.features.length) {
    throw new Error(`${type} : FeatureCollection non vide attendue`);
  }
  const resultats = new Map();
  for (const [index, feature] of contenu.features.entries()) {
    const proprietes = feature.properties ?? {};
    const nom = lireChamp(proprietes, champNom ? [champNom] : type === "rues"
      ? ["nom", "l_longmin"] : ["nom", "nom_long", "nom_gares", "nom_gare"]);
    if (!nom) throw new Error(`${type}, élément ${index} : nom absent (préciser --nom-${type})`);
    const id = lireChamp(proprietes, type === "rues" ? ["id", "n_sq_vo"] : ["id_ref_zdl", "id", "objectid"]) ?? String(feature.id ?? index);
    const g = feature.geometry;
    const geometries = type === "rues"
      ? g?.type === "LineString" ? [g.coordinates] : g?.type === "MultiLineString" ? g.coordinates : null
      : g?.type === "Point" ? [g.coordinates] : g?.type === "MultiPoint" ? g.coordinates : null;
    if (!Array.isArray(geometries) || !geometries.length) throw new Error(`${type}, ${nom} : géométrie incompatible`);
    if (type === "rues" && !geometries.every((l) => Array.isArray(l) && l.length >= 2 && l.every(positionValide))) {
      throw new Error(`${nom} : lignes WGS84 en Île-de-France attendues`);
    }
    if (type === "stations" && !geometries.every(positionValide)) throw new Error(`${nom} : positions WGS84 en Île-de-France attendues`);
    const cleGeometrie = type === "rues" ? "lignes" : "positions";
    const element = resultats.get(id) ?? { id, nom, alias: [], [cleGeometrie]: [] };
    if (element.nom !== nom && !element.alias.includes(nom)) element.alias.push(nom);
    if (Array.isArray(proprietes.alias)) element.alias.push(...proprietes.alias.filter((a) => typeof a === "string"));
    const arrondir = (p) => p.slice(0, 2).map((n) => Math.round(n * 1e6) / 1e6);
    element[cleGeometrie].push(...(type === "rues" ? geometries.map((l) => l.map(arrondir)) : geometries.map(arrondir)));
    resultats.set(id, element);
  }
  return [...resultats.values()].sort((a, b) => a.id.localeCompare(b.id)).map((element) => {
    const cle = type === "rues" ? "lignes" : "positions";
    element[cle] = [...new Map(element[cle].map((g) => [JSON.stringify(g), g])).values()];
    element.alias = [...new Set(element.alias)].sort();
    return element;
  });
}

