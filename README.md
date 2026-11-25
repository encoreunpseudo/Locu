# Mon Extension – template Chrome (Manifest V3)

<img width="681" height="563" alt="Capture d’écran 2026-11-25 à 20 56 19" src="https://github.com/user-attachments/assets/b98f5672-9cd9-4115-be8d-01ed7f16e7c4" />


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
6. Ouvrir une annonce Jinka ou Leboncoin (location), la recharger, puis cliquer sur l'icône de l'extension

## Déboguer

- Popup : clic droit sur le popup → *Inspecter*
- Service worker : lien *service worker* dans `chrome://extensions`
- Content script : DevTools de la page web (console)

## Construire et empaqueter

```sh
npm run build  # reconstruit dist/, prêt à charger dans Chrome
npm run zip    # reconstruit dist/ puis crée extension.zip à la racine
npm test       # tests locaux sur les annonces d'exemple et les cas ambigus
```

Le ZIP contient directement `manifest.json`, les scripts et les données, sans dossier
`dist/` intermédiaire. Pour l'installation en mode développeur, sélectionner `dist/`.

## Localisation

Le quartier est déterminé dans cet ordre :

1. **Quartier affiché par le site** (ex. « Javel », « Grenelle »), s'il est reconnu et
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

Tout se règle dans les options (clic droit sur l'icône → *Options*, ou le lien de la popup) :

1. **Clé PRIM personnelle** : chaque utilisateur crée gratuitement la sienne sur
   [prim.iledefrance-mobilites.fr](https://prim.iledefrance-mobilites.fr) et la colle dans les
   options. Le bouton « Enregistrer et tester » l'essaie sur un vrai trajet (Châtelet → Gare de
   Lyon) : une clé refusée n'est pas enregistrée. La clé est gardée dans `chrome.storage.local`
   (cet appareil seulement) et n'est envoyée qu'à PRIM. Aucune clé n'est intégrée à l'extension :
   elle peut être distribuée telle quelle.
2. **Lieux** : l'adresse est géocodée par l'API Adresse de l'IGN au moment de l'enregistrer,
   puis seules ses coordonnées sont gardées dans `chrome.storage.sync` (5 lieux au plus).

Sans clé ou sans lieu, la popup invite à les ajouter ; si PRIM refuse la clé, elle le dit
une seule fois au lieu d'afficher une erreur par lieu.

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

## Barème

Le barème vient du geojson open data de la Ville de Paris (*logement-encadrement-des-loyers*,
2019 à 2025, polygones des quartiers compris). La Ville n'y a pas ajouté la grille 2026 : elle
est importée directement de l'arrêté préfectoral du 12 juin 2026 (IDF-2026-06-12-00003), qui
donne les loyers par secteur géographique (annexe 2) et le secteur de chaque quartier (annexe 1).
Le résultat, `data/encadrement-2026.json`, a le même format que les lignes du geojson ; le build
l'ajoute au barème, sauf si l'année est entre-temps publiée en open data.

```sh
brew install poppler   # fournit pdftotext
node scripts/importer-arrete.mjs 2026 https://cdn.paris.fr/paris/2026/06/17/arrete-prefectoral-encadrement-des-loyers-12-06-2026-publie-n4wk.pdf
```

Le script vérifie la cohérence de la grille (minoré = −30 %, majoré = +20 %, meublé = référence
+ majoration) ; appliqué à l'arrêté 2025, il redonne exactement les lignes 2025 du geojson.

L'arrêté 2026 s'applique du 1er juillet au **24 novembre 2026**, fin de l'expérimentation prévue
par la loi ELAN, sauf prolongation par la loi. La popup signale quand le barème est périmé.
