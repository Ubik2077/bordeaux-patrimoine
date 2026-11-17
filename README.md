# 🏛️ Port de la Lune — prototype

Carte 3D des monuments historiques du centre de Bordeaux, dans l'esprit d'une maquette :
le centre est découpé en « île », les bâtiments sont en relief à leur hauteur réelle,
et les monuments phares sont colorés **par époque** (Antiquité, Moyen Âge, XVIIIᵉ, XIXᵉ, XXᵉ–XXIᵉ).
Suite de « Bordeaux à la carte » (bars et restaurants).

**Prototype visuel** : 22 monuments avec un aperçu au survol et une fiche illustrée
(photos « Autrefois / Aujourd'hui », visionneuse plein écran), les autres bâtiments protégés en beige
(lien vers leur notice officielle Mérimée), et trois promenades à pied depuis l'hôtel tracées sur les rues.
En cinq langues (français, anglais, espagnol, italien, allemand ; menu 🌐, langue du téléphone détectée).
Fonctionne hors ligne et s'installe comme une application (voir plus bas).

## 🌍 En ligne

👉 **<https://ubik2077.github.io/bordeaux-patrimoine/>**

Hébergée gratuitement par GitHub Pages, depuis le dépôt <https://github.com/Ubik2077/bordeaux-patrimoine>.
Chaque `git push` sur `main` met le site à jour en une à deux minutes. Après une modification des fichiers
`js/` ou `css/`, augmenter le numéro `?v=` dans `index.html` (et dans les `import` de `js/app.js` et `js/i18n.js`)
pour que les visiteurs ne gardent pas l'ancienne version en cache.

## 📴 Hors ligne et installation

`sw.js` garde la carte, les données et les miniatures des photos dès la première visite ; les grandes photos
sont gardées quand on les ouvre (hors ligne, une photo jamais ouverte est remplacée par sa miniature).
En ligne, les fichiers sont toujours repris du serveur : une mise à jour publiée est visible au chargement suivant.
`manifest.webmanifest` et `img/icone-*.png` permettent d'« ajouter à l'écran d'accueil » sur téléphone.
Si un fichier est ajouté au site, l'ajouter aussi à la liste `COEUR` de `sw.js`.

Le bouton ◎ de la barre d'outils affiche « Vous êtes ici » et le monument le plus proche (le navigateur demande
l'autorisation ; fonctionne uniquement dans le centre de Bordeaux).

## 🖨️ Affiche pour la réception

[affiche-port-de-la-lune.pdf](affiche-port-de-la-lune.pdf) : affiche A5 avec le QR code du site, en français et en anglais
(les autres langues sont annoncées). À imprimer en A5, sans marges, sans mise à l'échelle.
Elle est aussi en ligne : <https://ubik2077.github.io/bordeaux-patrimoine/affiche.html> (bouton « Imprimer »).

[affiche-port-de-la-lune-a3.pdf](affiche-port-de-la-lune-a3.pdf) (A3, pour le comptoir) et
[affiche-port-de-la-lune-a2.pdf](affiche-port-de-la-lune-a2.pdf) (A2, pour le mur) : la ville entière en relief avec
les 22 monuments numérotés, leur résumé par époque, les promenades et le QR code. Textes en français suivis de l'anglais,
sauf les résumés (les anglophones sont invités à les lire dans l'application). À imprimer sans marges, sans mise à l'échelle.
En ligne : <https://ubik2077.github.io/bordeaux-patrimoine/affiche-a3.html> (A3) et `affiche-a3.html?a2` (A2).

Pour les modifier : éditer `affiche.html` ou `affiche-a3.html` (les résumés de l'A3 sont en haut de son script),
puis `sh scripts/affiche.sh` (site lancé en local) regénère les PDF.
Les images des cartes sont des captures de la carte 3D (`?capture`, voir le script ; pour l'A3, `scripts/capture-a3.js`).

## Lancer

```bash
python3 -m http.server 8643
```

puis ouvrir <http://localhost:8643>.

## Données

| Fichier | Source |
|---|---|
| `data/batiments.json` | Bâtiments et hauteurs : IGN BD TOPO (Licence Ouverte). Monuments repérés via OpenStreetMap (ODbL) |
| `data/sol.json` | Garonne et rues : IGN BD TOPO. Parcs et places : OpenStreetMap |
| `data/arbres.json` | Arbres : OpenStreetMap |
| `data/monuments.json` | Fiches et aperçus rédigés à la main (`scripts/monuments.mjs`) |
| `data/promenades.json` | Promenades et temps de marche depuis l'hôtel, calculés sur les rues IGN BD TOPO (`scripts/promenades.mjs`) |
| `data/photos.json`, `img/monuments/` | Photos anciennes et actuelles (WebP) : Wikimedia Commons, choisies dans `scripts/photos.py`. Auteur, licence et lien source sont affichés sous chaque photo |

Bâtiments, sol et arbres sont écrits dans un format compact (`scripts/compact.mjs`, décodé par `js/compact.js`) :
coordonnées entières codées par écart, même précision que le GeoJSON mais environ 4 fois plus léger.
La page charge environ 2,7 Mo (850 Ko une fois compressés par le serveur) ; les photos ne sont
téléchargées qu'à l'ouverture d'une fiche. Après avoir régénéré `data/`, augmenter `DONNEES` dans `js/app.js`
pour que les navigateurs ne gardent pas l'ancienne version en cache.

Pour régénérer :

```bash
npm install
node scripts/fetch.mjs     # télécharge les données brutes (dossier temporaire)
node scripts/build.mjs     # produit data/*.json
node scripts/promenades.mjs  # calcule les promenades (à relancer si les étapes changent)
python3 scripts/photos.py  # télécharge les photos (Pillow requis)
```

Pour changer une photo, modifier sa ligne dans `scripts/photos.py` (nom exact du fichier sur Commons),
supprimer l'image correspondante dans `img/monuments/` puis relancer le script.

- Traductions : le français est la langue source (interface dans `js/i18n.js`, contenus dans `data/`).
  Les autres langues sont dans `js/lang/<code>.js`, chargées seulement quand on les choisit. Les légendes
  de photos y sont rangées dans l'ordre de `data/photos.json` : si l'on ajoute ou retire une photo dans
  `scripts/photos.py`, mettre à jour les quatre fichiers. Un texte absent d'une langue s'affiche en français.
- Les promenades (nom, texte, ordre des étapes) se règlent en haut de `scripts/promenades.mjs`.
  Le plus court chemin est calculé à 70 m/min, en évitant un peu les grands boulevards.
- La forme de l'île se règle dans `scripts/build.mjs` (points `CTRL`).
- Les monuments, leurs époques, couleurs et textes sont dans `scripts/monuments.mjs`.
- Les flèches (Saint-Michel, cathédrale, Pey-Berland) et la colonne des Girondins sont dessinées
  par empilement d'octogones dans `build.mjs`, car les données ne donnent pas leur forme.
