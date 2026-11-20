// Remplacée au build par la valeur de PRIM_API_KEY dans .env (voir build.mjs).
// Elle se retrouve en clair dans dist/ et extension.zip : à réserver à un usage personnel.
declare const __PRIM_API_KEY__: string | undefined;
export const CLE_PRIM: string = typeof __PRIM_API_KEY__ === "string" ? __PRIM_API_KEY__ : "";
