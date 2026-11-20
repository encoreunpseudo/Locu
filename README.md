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
   cohérent avec l'arrondissement du titre. C'est le cas normal.
2. **Croisement des indices** : la position de l'annonce (JSON-LD) placée dans les polygones
   du barème, les **voies** citées dans la description (« rue de Lourmel » → Grenelle, Javel)
   et les **stations** citées (quartiers à moins de 500 m). Chaque indice vote pour ses
   quartiers ; on garde ceux qui recueillent le plus de voix. Le résultat est signalé comme
   estimé, et une contradiction entre indices est signalée, jamais tranchée en silence.
3. **Tous les quartiers de l'arrondissement** ; le verdict n'est alors affirmatif que s'il
   vaut pour chacun d'eux.

Si le quartier affiché contredit l'arrondissement, les quartiers concernés sont conservés
et la contradiction est signalée.

Une **position estimée** avec sa marge d'erreur est aussi calculée (en vue du temps de trajet),
de la plus précise à la plus grossière : position de l'annonce si elle concorde avec les rues
citées (150 m), point de la rue le plus proche de la station citée (200 m), station(s) seule(s),
croisement de deux rues citées, milieu de la rue, puis centre du ou des quartiers.

Rues et stations viennent de deux référentiels publics consultés en ligne, puis gardés
30 jours dans `chrome.storage.local` : les voies de la Ville de Paris
(`opendata.paris.fr`, jeu *denominations-emprises-voies-actuelles*) et les gares et stations
d'IDFM (`data.iledefrance-mobilites.fr`, jeu *emplacement-des-gares-idf*). Seuls des noms de
voies publiques sont envoyés, rien sur l'utilisateur ni sur l'annonce. Hors ligne, la
localisation continue avec les indices locaux et le signale.

## Temps de trajet

La popup affiche le temps en transports en commun entre le logement et les lieux de
l'utilisateur (travail, université…), par exemple « Fac · 25–29 min · Métro 10 · direct ».

1. **Clé PRIM** : créer un compte sur [prim.iledefrance-mobilites.fr](https://prim.iledefrance-mobilites.fr),
   puis mettre la clé dans `.env` à la racine (fichier ignoré par git) :
   `PRIM_API_KEY=...`, puis `npm run build`. ⚠️ La clé est intégrée en clair dans `dist/` et
   `extension.zip` : ne pas distribuer ce ZIP au-delà d'un usage personnel.
2. **Lieux** : clic droit sur l'icône → *Options* (ou le lien « Ajouter mes lieux » de la popup).
   L'adresse est géocodée par l'API Adresse de l'IGN au moment de l'enregistrer, puis seules
   ses coordonnées sont gardées dans `chrome.storage.sync` (5 lieux au plus).

Le trajet part de la **position estimée** du logement (voir Localisation), un **jour ouvré à
8 h 30**, pour que le résultat ne dépende pas de l'heure d'ouverture de la popup. La fourchette
traduit l'incertitude de position en marche : `marge = rayon ÷ 80 m/min` ; le maximum ajoute la
marge, le minimum la retire sans dépasser la marche jusqu'au premier arrêt. Au-delà de 1 500 m
d'incertitude, aucun temps n'est affiché. Les itinéraires sont gardés 7 jours en cache.

Sous chaque lieu, le détail du trajet s'affiche façon Citymapper : `🚶 3 › Ⓜ10 12 › 🚶 11`
(une icône par étape, suivie de sa durée en minutes ; l'attente sur le quai est comptée dans la
ligne qui suit). Un clic sur le lieu déplie l'itinéraire vertical, station par station :
heures de passage, ligne et direction, nombre d'arrêts, correspondances et attente (le premier
lieu est déplié d'office). Les pictogrammes officiels des lignes de métro, RER, Transilien et tram viennent
du jeu *emplacement-des-gares-idf* d'Île-de-France Mobilités ; l'icône de marche vient de
Material Symbols (Google, licence Apache 2.0). Ils sont versionnés dans `data/pictos/` ;
pour les mettre à jour :

```sh
node scripts/telecharger-pictos.mjs
```

Les lignes sans pictogramme (bus, lignes récentes) s'affichent avec un badge à leurs couleurs.

Le calcul compare le loyer aux **plafonds majorés** possibles. Quand seule l'époque de
construction manque, la popup indique pour quelles époques le loyer dépasse le plafond.

Le barème fourni s'arrête à **2025** (baux signés du 1er juillet 2025 au 30 juin 2026) ;
la popup signale quand il est périmé.
