# Référentiels locaux de localisation

Les 80 quartiers et leurs polygones sont extraits du GeoJSON existant par `npm run build`.
Ils sont enregistrés une seule fois dans `dist/data/quartiers.json`.

**État livré : les référentiels de rues et de stations sont vides.** Leur téléchargement
n'était pas accessible dans l'environnement de développement. L'extension le signale
pour chaque indice non résolu ; elle conserve les quartiers de l'arrondissement.
Elle utilise déjà les alias de quartiers et les coordonnées du JSON-LD de l'annonce active.
Les coordonnées de précision inconnue classent les quartiers sans exclure les autres.

## Importer les rues et stations

Obtenir deux exports **GeoJSON WGS84** :

- [Voies de la Ville de Paris](https://opendata.paris.fr/explore/dataset/voie/).
  Géométrie `LineString` ou `MultiLineString`, nom complet `l_longmin`, identifiant `n_sq_vo`.
- [Gares et stations d'Île-de-France Mobilités](https://data.iledefrance-mobilites.fr/explore/dataset/emplacement-des-gares-idf/).
  Géométrie `Point` ou `MultiPoint`. Le convertisseur accepte les noms `nom`,
  `nom_long`, `nom_gares` ou `nom_gare` et regroupe les positions d'un même `id_ref_zdl`.

Créer un fichier `sources.json` contenant un tableau de deux objets avec les champs
`nom`, `url`, `licence`, `dateImport`, d'après les métadonnées des exports téléchargés.
La provenance et les licences sont conservées dans le fichier embarqué.

```sh
npm run import:localisation -- --rues /chemin/voies.geojson --stations /chemin/stations.geojson --sources /chemin/sources.json
npm run zip
```

Si les noms des colonnes diffèrent, ajouter `--nom-rues NOM_COLONNE` et/ou
`--nom-stations NOM_COLONNE`. Les propriétés en majuscules sont également acceptées.
Les alias explicites peuvent être fournis dans une propriété `alias` (tableau de chaînes).
Le convertisseur rejette les exports vides et les coordonnées incompatibles, puis remplace
le fichier de destination seulement après validation des deux référentiels.

Cet import lit seulement les fichiers fournis. Le build et l'extension n'effectuent aucun
téléchargement. Le fichier `data/localisation-lieux.json` peut être versionné et redistribué
selon les licences des sources.

## Règles de localisation

- `Javel` est un alias du quartier `7511560` (`Javel 15Art` dans le barème).
- Le JSON-LD doit identifier l'URL active `/ad/…`. Les scripts d'hydratation et l'URL
  canonique ne servent pas à choisir une annonce ; ils peuvent conserver une annonce précédente.
- Une rue reconnue comme adresse fournit tous les quartiers croisés par ses tronçons,
  avec une marge de 30 mètres pour les deux côtés de la rue. Ce résultat est une estimation.
- Une rue simplement proche, une station et un point Jinka de précision inconnue ne
  suppriment pas de quartiers. Ils servent au classement ; aucun score n'est présenté
  comme une probabilité.
- Les temps à pied ne sont pas du routage : `80 m/min + 150 m` sert uniquement au classement.
  Sans distance explicite, le rayon indicatif est de 800 mètres. Les durées en voiture
  ne sont pas converties en distances de marche.
- Les contradictions entre contraintes conservent les candidats concernés. Un indice
  faible contradictoire marque également le résultat comme ambigu.
- La rue n'est pas géocodée au numéro. Le référentiel de stations contient des positions,
  pas nécessairement toutes leurs entrées. Aucune adresse exacte n'est inventée.

Le barème initial fourni dans ce dépôt s'arrête à **2025**. L'interface affiche son année
et signale un barème antérieur à l'année courante ; ces changements ne mettent pas à jour
les données réglementaires.
