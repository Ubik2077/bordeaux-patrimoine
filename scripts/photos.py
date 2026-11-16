#!/usr/bin/env python3
"""Télécharge les photos des monuments depuis Wikimedia Commons, les redimensionne et écrit
data/photos.json avec légende, auteur, licence et lien vers la page source (crédits obligatoires).

Usage : python3 scripts/photos.py          (ne retélécharge pas les images déjà présentes)
Dépend de Pillow (pip install pillow).
"""
import io, json, os, re, time, urllib.parse, urllib.request
from html import unescape
from PIL import Image
Image.MAX_IMAGE_PIXELS = None  # certaines numérisations anciennes sont très grandes

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'img', 'monuments')
UA = {'User-Agent': 'bordeaux-patrimoine-proto/0.1 (prototype de carte touristique)'}
API = 'https://commons.wikimedia.org/w/api.php'

A, J = 'autrefois', 'aujourdhui'
# (période, fichier Commons, légende). L'ordre est l'ordre d'affichage dans la fiche.
CHOIX = {
    'gallien': [
        (A, "L'Amphitheastre dit le palais de Gaillian, près la ville de Bordeaux - Par C. Chastillon - btv1b55005010t.jpg",
         "L'amphithéâtre reconstitué, gravure de Claude Chastillon publiée en 1641"),
        (A, 'Bordeaux-les-ruines-du-Palais-Gallien 10.jpg', 'Les ruines vers 1900, carte postale'),
        (J, 'Palais Galien-panoramique.jpg', 'Les ruines aujourd’hui'),
    ],
    'seurin': [
        (A, 'Bordeaux Basilique Saint-Seurin 1.jpg', 'La façade vers 1900, carte postale'),
        (J, 'Bordeaux façade église Saint-Seurin a.jpg', 'La façade aujourd’hui'),
    ],
    'cathedrale': [
        (A, 'Bordeaux-St André-cp-0003.jpg', 'La cathédrale vers 1900, carte postale'),
        (J, 'Cathédrale St André Bordeaux 3.jpg', 'La cathédrale aujourd’hui'),
    ],
    'peyberland': [
        (A, 'Charles Chambon - Bordeaux Tour Pey Berland.jpg', 'La tour et la cathédrale vers 1900'),
        (A, 'Bordeaux la tour Pey-Berland 1.jpg', 'La tour vers 1900, carte postale'),
        (J, 'Bordeaux Tour Pey Berland 3.jpg', 'La tour aujourd’hui'),
    ],
    'grossecloche': [
        (A, 'Bordeaux - Grosse Cloche et un dirigeable.jpg', 'Un dirigeable survole la Grosse Cloche, vers 1920'),
        (A, 'Bordeaux la grosse-cloche 2.jpg', 'La Grosse Cloche vers 1900, carte postale'),
        (J, 'Grosse cloche de Bordeaux.jpg', 'La Grosse Cloche aujourd’hui'),
    ],
    'cailhau': [
        (A, 'Porte Cailhau, Bordeaux - TEK - TEKA0116588.tif', 'La porte en 1907'),
        (J, 'Porte Cailhau.jpg', 'La porte aujourd’hui'),
    ],
    'saintmichel': [
        (A, "Lithographie de l'église Saint-Michel de Bordeaux, en 1834.jpg", 'La basilique et sa tour privée de flèche, lithographie de 1834'),
        (A, 'Marville, Charles - Eine Kirche mit Baugerüst in Südfrankreich, Bordeaux (Zeno Fotografie).jpg',
         'La flèche sous les échafaudages, photographie de Charles Marville, milieu du XIXᵉ siècle'),
        (J, '10-Bordeaux - basilique Saint-Michel (3).JPG', 'La basilique aujourd’hui'),
    ],
    'saintecroix': [
        (A, 'Sainte-Croix BDX Daguerrotype.jpg', 'La façade sur un daguerréotype de 1841'),
        (A, 'Abbatiale Sainte-Croix de Bordeaux - Hallwylska museet - 107467.tif', 'La façade en 1886'),
        (J, '2023 Abbatiale Sainte Croix (Bordeaux) (01).jpg', 'La façade aujourd’hui'),
    ],
    'bourse': [
        (A, 'Vue en perspective de la place royale de Bordeaux, dessin à l’encre par Alexandre Antoine Marolles, 1737. BNF.png',
         'La place royale vue du fleuve, dessin d’Alexandre Antoine Marolles, 1737'),
        (A, 'Bordeaux - Place de la Bourse 2.jpg', 'La place et la fontaine des Trois Grâces vers 1900, carte postale'),
        (J, '@Q3390346', 'La place et le Miroir d’eau aujourd’hui'),
    ],
    'grandtheatre': [
        (A, 'Les Salles de spectacle construites par Victor Louis 1903 pl01 Théâtre de Bordeaux, Vue perspective de la façade.jpg',
         'La façade dessinée par Victor Louis, gravure d’après ses planches'),
        (A, 'Bordeaux - Le Grand Théâtre.jpg', 'Le Grand Théâtre vers 1900, carte postale'),
        (J, 'Grand Theatre Bordeaux.JPG', 'Le Grand Théâtre aujourd’hui'),
    ],
    'rohan': [
        (A, 'Bordeaux - Hôtel de ville (1845).jpg', 'L’hôtel de ville, ancien palais Rohan, en 1845'),
        (A, "BR 284 - 48 - BORDEAUX - L'Hotel-de-Ville.jpg", 'Le palais et les tramways vers 1908, carte postale'),
        (J, '00 2676 Hôtel de ville de Bordeaux (Palais Rohan).jpg', 'Le palais aujourd’hui'),
    ],
    'aquitaine': [
        (A, "Bordeaux - Porte d'Aquitaine 20.jpg", 'La porte et la place vers 1910, carte postale'),
        (J, '022 - Place de la Victoire - Bordeaux.jpg', 'La porte aujourd’hui, place de la Victoire'),
    ],
    'bourgogne': [
        (A, 'Bordeaux Porte de Bourgogne vers 1905.jpg', 'La porte et la place vers 1905, carte postale'),
        (J, 'Bordeaux Porte de Bourgogne Vue n°3.jpg', 'La porte aujourd’hui'),
    ],
    'pontdepierre': [
        (A, 'Vue de la ville et du pont de Pierre - 1830.JPG', 'La ville et le pont de pierre en 1830'),
        (A, 'Bordeaux - Garonne et pont de pierre.jpg', 'La Garonne et le pont vers 1900, carte postale'),
        (J, 'Bordeaux - Pont de Pierre vu depuis la flèche Saint Michel V2.jpg', 'Le pont aujourd’hui, vu de la flèche Saint-Michel'),
    ],
    'girondins': [
        (A, 'Bordeaux. La Colonne des Girondins LCCN2017659773.jpg', 'La colonne au début du XXᵉ siècle, photochrome'),
        (A, 'Bordeaux - Monument des Girondins.jpg', 'Les chevaux de la fontaine vers 1910, carte postale'),
        (J, 'Le monument aux Girondins (Bordeaux).JPG', 'Le monument aujourd’hui'),
    ],
    'citeduvin': [
        (J, 'Bordeaux Quai de Bacalan (1).jpg', 'La Cité du Vin au bord de la Garonne'),
    ],
    'chaban': [
        (A, 'Bordeaux - Pont Chaban Delmas en construction - Panorama (7802777516).jpg', 'Le pont en construction, été 2012', 'Le chantier'),
        (J, 'Pont Jacques-Chaban-Delmas levé 03.JPG', 'Le tablier levé pour laisser passer un navire'),
    ],
}


def api(**p):
    p['format'] = 'json'
    for i in range(8):
        time.sleep(0.8)
        try:
            req = urllib.request.Request(API + '?' + urllib.parse.urlencode(p), headers=UA)
            return json.load(urllib.request.urlopen(req, timeout=60))
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(10 * (i + 1))
    raise SystemExit('Commons refuse les requêtes (429)')


def fetch(url):
    for i in range(3):
        time.sleep(1.5)
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(10 * (i + 1))
    raise RuntimeError('trop de refus (429)')


def wikidata_image(q):
    req = urllib.request.Request(f'https://www.wikidata.org/wiki/Special:EntityData/{q}.json', headers=UA)
    e = json.load(urllib.request.urlopen(req, timeout=60))['entities'][q]
    return e['claims']['P18'][0]['mainsnak']['datavalue']['value']


def texte(html):
    return re.sub(r'\s+', ' ', unescape(re.sub(r'<[^>]+>', '', html or ''))).strip()


def nettoyer_auteur(a):
    """Remet en forme les champs « Artist » de Commons, souvent bruts."""
    if not a or re.search(r'Unknown author|Anonymous|^Auteur inconnu', a):
        return 'Auteur inconnu'
    a = a.lstrip('= ').strip()
    m = re.search(r'wiki/(?:Gebruiker|User|Utilisateur):([^/ ]+)', a)
    if m:
        return urllib.parse.unquote(m.group(1)).replace('_', ' ')
    a = re.sub(r'^Image details\s+.*?\s(\S+)\s+CC-BY.*$', r'\1', a)  # « Image details Casio … Pseudo CC-BY-3.0 »
    a = re.sub(r' from France$', ' (Flickr)', a)
    return a


def main():
    os.makedirs(IMG, exist_ok=True)
    out = {}
    for mid, items in CHOIX.items():
        out[mid] = []
        for n, (periode, fichier, legende, *onglet) in enumerate(items, 1):
            if fichier.startswith('@'):
                fichier = wikidata_image(fichier[1:])
            r = api(action='query', titles='File:' + fichier, prop='imageinfo',
                    iiprop='url|extmetadata|size', iiurlwidth=1280,  # tailles standard seulement (sinon refus)
                    iiextmetadatafilter='Artist|Credit|LicenseShortName|DateTimeOriginal')
            page = next(iter(r['query']['pages'].values()))
            if 'imageinfo' not in page:
                print(f'  ⚠ introuvable : {fichier}')
                continue
            ii = page['imageinfo'][0]
            md = ii['extmetadata']
            nom = f'{mid}-{n}'
            grand, petit = os.path.join(IMG, nom + '.jpg'), os.path.join(IMG, nom + '-mini.jpg')
            if not os.path.exists(grand):
                im = None
                # la miniature d'abord ; si Commons refuse de la générer, le fichier original
                for url in (ii.get('thumburl'), ii['url']):
                    try:
                        im = Image.open(io.BytesIO(fetch(url)))
                        break
                    except Exception as e:
                        print(f'  ⚠ {nom} : {e} ({url.rsplit("/", 1)[-1][:40]})')
                if im is None:
                    continue
                im = im.convert('RGB')
                im.thumbnail((1400, 1400))
                im.save(grand, quality=80, optimize=True, progressive=True)
                im.thumbnail((360, 360))
                im.save(petit, quality=74, optimize=True)
            auteur = nettoyer_auteur(texte(md.get('Artist', {}).get('value')))
            out[mid].append({
                'src': f'img/monuments/{nom}.jpg',
                'mini': f'img/monuments/{nom}-mini.jpg',
                'periode': periode,
                'legende': legende,
                'auteur': auteur[:120],
                'licence': md.get('LicenseShortName', {}).get('value', ''),
                'source': ii['descriptionurl'],
                **({'onglet': onglet[0]} if onglet else {}),
            })
            print(f'✓ {nom:16} {periode:10} {auteur[:40]} · {out[mid][-1]["licence"]}')
    with open(os.path.join(ROOT, 'data', 'photos.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
