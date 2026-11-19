# Mon Extension – template Chrome (Manifest V3)

## Structure

```
manifest.json        Configuration de l'extension
background.js        Service worker (arrière-plan, messages, events)
popup/               Fenêtre qui s'ouvre au clic sur l'icône
content/             Script + CSS injectés dans les pages web
options/             Page de paramètres
```

Pas d'icône fournie : Chrome affiche une lettre par défaut. Pour en ajouter,
déclarer `"icons"` et `"action.default_icon"` dans le manifest (16/48/128 px).

## Installer en local

1. `npm install` puis `npm run build` (vérifie les types et construit l'extension dans `dist/`)
2. Ouvrir `chrome://extensions`
3. Activer **Mode développeur** (en haut à droite)
4. **Charger l'extension non empaquetée** → choisir le dossier **`dist/`** (pas la racine : `node_modules` empêche le chargement)
5. Après chaque modification : `npm run build`, puis cliquer sur ↻ dans la carte de l'extension
6. Ouvrir une annonce Jinka, la recharger, puis cliquer sur l'icône de l'extension

## Déboguer

- Popup : clic droit sur le popup → *Inspecter*
- Service worker : lien *service worker* dans `chrome://extensions`
- Content script : DevTools de la page web (console)

## Construire et empaqueter

```sh
npm run build  # reconstruit dist/, prêt à charger dans Chrome
npm run zip    # reconstruit dist/ puis crée extension.zip à la racine
npm test       # tests locaux sur les deux annonces et les cas ambigus
```

Le ZIP contient directement `manifest.json`, les scripts et les données, sans dossier
`dist/` intermédiaire. Pour l'installation en mode développeur, sélectionner `dist/`.

## Localisation déterministe

`popup/localisation.ts` expose les classes du dossier `popup/localisation/` :

- `ExtracteurLocalisationJinka` lit les blocs du DOM ; `LecteurJsonLd` valide l'annonce active.
- `NormaliseurLieu`, `ReferentielQuartiers` et `ReferentielLieux` reconnaissent les lieux.
- `GeometrieLocale` calcule les appartenances et intersections ; `AnalyseurProximite`
  transforme les distances explicites en indications de proximité.
- `ResolveurLocalisation` conserve les candidats, les indices et les contradictions.
- `DepotLocalisation` charge et met en cache les fichiers embarqués.

Le moteur conserve plusieurs quartiers lorsque les données ne permettent pas de trancher.
Le calcul compare le loyer au minimum et au maximum des **plafonds majorés** possibles.
Il ne confond pas la borne basse des plafonds avec le loyer de référence minoré.

**Les données rues/stations restent à importer** ; les indices non résolus sont signalés.
Voir [les sources, l'import et les limites](data/LOCALISATION.md). Aucun appel à un LLM
ou à une API géographique n'est effectué pendant l'analyse.
