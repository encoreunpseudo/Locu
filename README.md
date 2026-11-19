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

## Localisation

Le quartier est déterminé dans cet ordre :

1. **Quartier affiché par Jinka** (ex. « Javel », « Grenelle »), s'il est reconnu et
   cohérent avec l'arrondissement du titre. C'est le cas normal ; rien d'autre n'est cherché.
2. **Position de l'annonce** (JSON-LD de l'annonce active) placée dans les polygones des
   quartiers du barème. Le résultat est signalé comme estimé.
3. **Tous les quartiers de l'arrondissement** ; le verdict n'est alors affirmatif que s'il
   vaut pour chacun d'eux.

Si le quartier affiché contredit l'arrondissement, les quartiers concernés sont conservés
et la contradiction est signalée. Aucun appel réseau n'est effectué pendant l'analyse.

Le calcul compare le loyer aux **plafonds majorés** possibles. Quand seule l'époque de
construction manque, la popup indique pour quelles époques le loyer dépasse le plafond.

Le barème fourni s'arrête à **2025** (baux signés du 1er juillet 2025 au 30 juin 2026) ;
la popup signale quand il est périmé.
