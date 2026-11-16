# 🏛️ Port de la Lune — prototype

Carte 3D des monuments historiques du centre de Bordeaux, dans l'esprit d'une maquette :
le centre est découpé en « île », les bâtiments sont en relief à leur hauteur réelle,
et les monuments phares sont colorés **par époque** (Antiquité, Moyen Âge, XVIIIᵉ, XIXᵉ, XXᵉ–XXIᵉ).
Suite de « Bordeaux à la carte » (bars et restaurants).

**Prototype visuel** : 17 monuments avec un aperçu au survol et une fiche illustrée
(photos « Autrefois / Aujourd'hui », visionneuse plein écran), les autres bâtiments protégés en beige
(lien vers leur notice officielle Mérimée). Pas encore d’itinéraires, de traductions ni de mode hors ligne.

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
| `data/photos.json`, `img/monuments/` | Photos anciennes et actuelles : Wikimedia Commons, choisies dans `scripts/photos.py`. Auteur, licence et lien source sont affichés sous chaque photo |

Pour régénérer :

```bash
npm install
node scripts/fetch.mjs     # télécharge les données brutes (dossier temporaire)
node scripts/build.mjs     # produit data/*.json
python3 scripts/photos.py  # télécharge les photos (Pillow requis)
```

Pour changer une photo, modifier sa ligne dans `scripts/photos.py` (nom exact du fichier sur Commons),
supprimer l'image correspondante dans `img/monuments/` puis relancer le script.

- La forme de l'île se règle dans `scripts/build.mjs` (points `CTRL`).
- Les monuments, leurs époques, couleurs et textes sont dans `scripts/monuments.mjs`.
- Les flèches (Saint-Michel, cathédrale, Pey-Berland) et la colonne des Girondins sont dessinées
  par empilement d'octogones dans `build.mjs`, car les données ne donnent pas leur forme.
