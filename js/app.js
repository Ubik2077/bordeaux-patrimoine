// Port de la Lune — prototype de carte 3D des monuments historiques de Bordeaux.
/* global maplibregl */
// ?v= : à augmenter avec celui de index.html, pour que les navigateurs ne gardent pas d'ancienne version
import { deplier, polygonesAutour } from './compact.js?v=30';
import { LANGS, t, getLang, setLang, applyStatic, tEpoque, tMonument, tPhoto, tPromenade, fmtKm as km, fmtDuree as duree } from './i18n.js?v=30';

const COUL = {
  sol: '#e2dfd7', socle: '#cfc6b5', socle2: '#b9ae99',
  place: '#f4f2ec', vert: '#c3d59f', eau: '#94c3e4', rue: '#ffffff',
  bati: '#f7f6f2', protege: '#e6d3a6', arbre: '#8fb46b',
};
const VUE = { center: [-0.5705, 44.8435], zoom: 13.2, pitch: 52, bearing: -28 };

const DONNEES = 15; // à changer quand les fichiers de data/ sont régénérés (évite l'ancienne version en cache)
const json = (u) => fetch(`${u}?v=${DONNEES}`).then((r) => r.json());
// les gros fichiers partent tout de suite, pendant que la carte s'initialise
const volumes = Promise.all([json('data/sol.json'), json('data/batiments.json'), json('data/arbres.json')])
  .then(([sol, bati, arbres]) => ({ sol: deplier(sol), bati: deplier(bati), arbres: polygonesAutour(arbres, 3.3, 6) }));
const [, zone, meta, photos, marches] = await Promise.all([
  setLang(getLang()).then(() => null),
  json('data/zone.json'), json('data/monuments.json'), json('data/photos.json').catch(() => ({})),
  json('data/promenades.json').catch(() => ({ promenades: [], depuisHotel: {} })),
]);
const { epoques, monuments, hotel } = meta;
const parId = Object.fromEntries(monuments.map((m) => [m.id, m]));
applyStatic();
// textes dans la langue active (le français des données sert de repli)
const nom = (id) => (id === 'hotel' ? t('hotel') : tMonument(parId[id], 'name'));
const champ = (id, c) => tMonument(parId[id], c);
const nomEpoque = (k) => tEpoque(k, epoques[k].label);
const ZONE_BB = zone.geometry.coordinates[0].reduce((b, [x, y]) => [[Math.min(b[0][0], x), Math.min(b[0][1], y)], [Math.max(b[1][0], x), Math.max(b[1][1], y)]], [[180, 90], [-180, -90]]);

// ?capture : carte seule, sans cartouches ni animation (image de l'affiche, scripts/affiche.sh)
const PARAMS = new URLSearchParams(location.search);
const CAPTURE = PARAMS.has('capture');
// ?capture&vue=lon,lat,zoom,orientation,inclinaison : cadrage imposé
const VUE_IMPOSEE = (() => {
  const v = (PARAMS.get('vue') || '').split(',').map(Number);
  return v.length === 5 && v.every(Number.isFinite) ? { center: [v[0], v[1]], zoom: v[2], bearing: v[3], pitch: v[4] } : null;
})();
if (CAPTURE) document.body.classList.add('capture');

// vue d'ensemble : toute l'île, en laissant la place au cartouche du titre
function vueAccueil() {
  const mobile = innerWidth <= 640;
  const padding = CAPTURE ? { top: 10, bottom: 10, left: 10, right: 10 } : { top: 30, bottom: 30, left: 350, right: 60 };
  // sur téléphone (écran en hauteur), l'île entière serait minuscule : on cadre le cœur historique
  if (mobile) return { center: [-0.5728, 44.8405], zoom: 13.4, bearing: VUE.bearing, pitch: 50 };
  const c = map.cameraForBounds(ZONE_BB, { bearing: VUE.bearing, pitch: VUE.pitch, padding });
  return { center: c.center, zoom: c.zoom + 0.35, bearing: VUE.bearing, pitch: VUE.pitch };
}

const map = new maplibregl.Map({
  container: 'map',
  style: { version: 8, sources: {}, layers: [{ id: 'fond', type: 'background', paint: { 'background-color': '#f2eee5' } }] },
  ...VUE,
  maxPitch: 75,
  minZoom: 12,
  maxBounds: [[-0.62, 44.80], [-0.51, 44.89]],
  attributionControl: false,
  antialias: true,
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

// largeur des rues en mètres réels (selon leur importance w), convertie en pixels selon le zoom
const LARGEUR = { 3: 15, 2: 10, 1: 6.5, 0: 2.5 };
const parLargeur = (k) => ['match', ['get', 'w'], 3, LARGEUR[3] / k, 2, LARGEUR[2] / k, 1, LARGEUR[1] / k, LARGEUR[0] / k];
const largeurRues = ['interpolate', ['exponential', 2], ['zoom'], 12, parLargeur(27.1), 20, parLargeur(0.1058)];

// couleur d'un volume : époque du monument phare, sinon beige « protégé », sinon blanc
function couleurBati(actives) {
  const cas = ['match', ['get', 'e']];
  for (const [k, ep] of Object.entries(epoques)) cas.push(k, actives.has(k) ? ep.color : COUL.protege);
  cas.push(COUL.bati);
  return ['case', ['has', 'm'], cas, ['has', 'r'], COUL.protege, COUL.bati];
}

map.on('load', async () => {
  map.setLight({ anchor: 'viewport', color: '#ffffff', intensity: 0.42, position: [1.4, 200, 38] });

  map.addSource('zone', { type: 'geojson', data: zone });
  const { sol, bati, arbres } = await volumes;
  map.addSource('sol', { type: 'geojson', data: sol });
  map.addSource('bati', { type: 'geojson', data: bati });
  map.addSource('arbres', { type: 'geojson', data: arbres });

  // l'île : deux décalages plus sombres sous le sol donnent l'épaisseur d'une maquette
  map.addLayer({ id: 'socle2', type: 'fill', source: 'zone', paint: { 'fill-color': COUL.socle2, 'fill-translate': [0, 13], 'fill-translate-anchor': 'viewport', 'fill-antialias': true } });
  map.addLayer({ id: 'socle', type: 'fill', source: 'zone', paint: { 'fill-color': COUL.socle, 'fill-translate': [0, 8], 'fill-translate-anchor': 'viewport' } });
  map.addLayer({ id: 'sol', type: 'fill', source: 'zone', paint: { 'fill-color': COUL.sol } });

  map.addLayer({ id: 'places', type: 'fill', source: 'sol', filter: ['==', ['get', 't'], 'place'], paint: { 'fill-color': COUL.place } });
  map.addLayer({ id: 'vert', type: 'fill', source: 'sol', filter: ['==', ['get', 't'], 'vert'], paint: { 'fill-color': COUL.vert } });
  map.addLayer({ id: 'eau', type: 'fill', source: 'sol', filter: ['==', ['get', 't'], 'eau'], paint: { 'fill-color': COUL.eau } });
  map.addLayer({
    id: 'rues', type: 'line', source: 'sol', filter: ['==', ['get', 't'], 'rue'],
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'w'] },
    paint: {
      'line-color': COUL.rue,
      'line-width': largeurRues,
      'line-opacity': ['match', ['get', 'w'], 0, 0.75, 1],
    },
  });
  map.addLayer({ id: 'liseré', type: 'line', source: 'zone', paint: { 'line-color': '#fffdf8', 'line-width': 1.5, 'line-opacity': 0.9 } });

  map.addLayer({
    id: 'arbres', type: 'fill-extrusion', source: 'arbres', minzoom: 14,
    paint: { 'fill-extrusion-color': COUL.arbre, 'fill-extrusion-base': 3.5, 'fill-extrusion-height': 9.5, 'fill-extrusion-opacity': 1 },
  });
  map.addLayer({
    id: 'bati', type: 'fill-extrusion', source: 'bati',
    paint: {
      'fill-extrusion-color': couleurBati(new Set(Object.keys(epoques))),
      'fill-extrusion-height': ['get', 'h'],
      'fill-extrusion-base': ['coalesce', ['get', 'b'], 0],
      'fill-extrusion-vertical-gradient': true,
      'fill-extrusion-opacity': 1,
    },
  });

  // tracé de la promenade choisie : au-dessus des bâtiments pour rester lisible en 3D
  map.addSource('promenade', { type: 'geojson', data: ligne([]) });
  map.addLayer({ id: 'promenade-halo', type: 'line', source: 'promenade', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#fffaf0', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 6, 17, 11], 'line-opacity': 0.9 } });
  map.addLayer({ id: 'promenade', type: 'line', source: 'promenade', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#7a2340', 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 3, 17, 5.5] } });

  // clic sur un volume : fiche du monument phare, ou petite bulle pour un bâtiment protégé
  map.on('click', 'bati', (ev) => {
    const p = ev.features[0].properties;
    if (p.m) return ouvrir(p.m === 'fleche' ? 'saintmichel' : p.m);
    if (p.r) {
      new maplibregl.Popup({ closeButton: false, maxWidth: '260px' })
        .setLngLat(ev.lngLat)
        .setHTML(`<strong>${t('mh.titre')}</strong><br>${t('mh.texte')}<br><a href="${notice(p.r)}" target="_blank" rel="noopener">${t('mh.notice', { ref: p.r })} ↗</a>`)
        .addTo(map);
    }
  });
  map.on('mousemove', 'bati', (ev) => {
    const p = ev.features[0].properties;
    map.getCanvas().style.cursor = p.m || p.r ? 'pointer' : '';
    if (p.m) montrerApercu(p.m === 'fleche' ? 'saintmichel' : p.m, ev.point.x, ev.point.y - 6);
    else cacherApercu();
  });
  map.on('mouseleave', 'bati', () => { map.getCanvas().style.cursor = ''; cacherApercu(); });
  map.on('movestart', cacherApercu);

  poserReperes();
  intro();
});

const notice = (ref) => `https://pop.culture.gouv.fr/notice/merimee/${encodeURIComponent(ref)}`;

// ---------- repères (épingles HTML au-dessus du sol) ----------
const reperes = new Map();
function repere({ id, at, color, label, initiale, classe = '' }) {
  const el = document.createElement('div');
  el.className = 'repere ' + classe;
  el.style.setProperty('--c', color);
  el.innerHTML = `<span class="pied"></span><span class="tige"></span><span class="tete">${initiale}</span><span class="nom">${label}</span>`;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([at[1], at[0]]).addTo(map);
  el.setAttribute('aria-label', label); // après addTo, sinon MapLibre le remplace par « Map marker »
  return el;
}
function poserReperes() {
  const chiffres = { antique: 'I', medieval: 'II', lumieres: 'III', xix: 'IV', contemporain: 'V' };
  for (const m of monuments) {
    if (m.hidePin) continue;
    const el = repere({ id: m.id, at: m.at, color: epoques[m.epoque].color, label: nom(m.id), initiale: chiffres[m.epoque] });
    const go = (e) => { e.stopPropagation(); ouvrir(m.id); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
    const survol = () => { const r = el.querySelector('.tete').getBoundingClientRect(); montrerApercu(m.id, r.left + r.width / 2, r.top - 2); };
    el.addEventListener('mouseenter', survol);
    el.addEventListener('focus', survol);
    el.addEventListener('mouseleave', cacherApercu);
    el.addEventListener('blur', cacherApercu);
    reperes.set(m.id, el);
  }
  const h = repere({ at: hotel.at, color: '#22252b', label: t('hotel'), initiale: 'H', classe: 'hotel' });
  reperes.set('hotel', h);
  h.addEventListener('click', (e) => { e.stopPropagation(); map.flyTo({ center: [hotel.at[1], hotel.at[0]], zoom: 16.5, pitch: 60, duration: 1600 }); });

  const noms = () => document.body.classList.toggle('noms-visibles', map.getZoom() >= 15.4);
  map.on('zoom', noms); noms();
}

// ---------- légende par époque ----------
const actives = new Set(Object.keys(epoques));
function dessinerLegende() {
  const box = document.getElementById('legende');
  const compte = {};
  for (const m of monuments) if (!m.hidePin) compte[m.epoque] = (compte[m.epoque] || 0) + 1;
  const tout = actives.size === Object.keys(epoques).length;
  box.innerHTML = Object.entries(epoques).map(([k, ep]) => {
    const on = tout || actives.has(k);
    return `<button data-k="${k}" aria-pressed="${on}" class="${on ? '' : 'eteint'}"><span class="pastille" style="background:${ep.color}"></span>${nomEpoque(k)}<span class="nb">${compte[k] || 0}</span></button>`;
  }).join('') +
    `<div class="sep"></div><div class="info"><span class="pastille" style="background:${COUL.protege}"></span>${t('legende.protege')}</div>`;
}
function legende() {
  const box = document.getElementById('legende');
  dessinerLegende();
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.dataset.k;
    // premier clic : n'afficher que cette époque ; clic sur la seule active : tout réafficher
    if (actives.size === Object.keys(epoques).length) { actives.clear(); actives.add(k); }
    else if (actives.has(k) && actives.size === 1) Object.keys(epoques).forEach((x) => actives.add(x));
    else actives.has(k) ? actives.delete(k) : actives.add(k);
    if (!actives.size) Object.keys(epoques).forEach((x) => actives.add(x));
    for (const btn of box.querySelectorAll('button')) {
      const on = actives.has(btn.dataset.k);
      btn.classList.toggle('eteint', !on); btn.setAttribute('aria-pressed', on);
    }
    if (map.getLayer('bati')) map.setPaintProperty('bati', 'fill-extrusion-color', couleurBati(actives));
    for (const [id, el] of reperes) if (parId[id]) el.classList.toggle('estompe', !actives.has(parId[id].epoque));
    majListe();
  });
}
legende();

// ---------- aperçu au survol ----------
const apercu = document.getElementById('apercu');
const echap = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ONGLETS = { 'Le chantier': 'fiche.chantier' };
const photosDe = (id) => (photos[id] || []).map((p, i) => ({
  ...p, legende: tPhoto(id, i, p.legende), onglet: p.onglet && t(ONGLETS[p.onglet] || p.onglet),
  auteur: p.auteur === 'Auteur inconnu' ? t('photo.inconnu') : p.auteur,
}));
const photoActuelle = (id) => { const l = photosDe(id); return l.find((p) => p.periode === 'aujourdhui') || l[0]; };
let apercuId = null;
function montrerApercu(id, x, y) {
  if (matchMedia('(hover: none)').matches || id === actif) return cacherApercu();
  const m = parId[id]; if (!m) return;
  if (apercuId !== id) {
    const ep = epoques[m.epoque], ph = photoActuelle(id);
    apercu.innerHTML =
      (ph ? `<img src="${ph.mini}" alt="">` : '') +
      `<div class="ap-corps"><p class="ap-epoque" style="color:${ep.color}">${nomEpoque(m.epoque)} · ${echap(champ(id, 'dates'))}</p>` +
      `<p class="ap-nom">${echap(nom(id))}</p><p class="ap-texte">${echap(champ(id, 'apercu') || '')}</p>` +
      `<p class="ap-plus">${t('apercu.plus')}</p></div>`;
    apercuId = id;
  }
  // garde la bulle dans l'écran (elle s'affiche au-dessus du point visé)
  const h = apercu.offsetHeight || 260;
  apercu.style.left = Math.min(Math.max(x, 135), innerWidth - 135) + 'px';
  apercu.style.top = Math.max(y, h + 20) + 'px';
  apercu.hidden = false;
}
function cacherApercu() { apercu.hidden = true; apercuId = null; }

// ---------- fiche ----------
const fiche = document.getElementById('fiche');
const $ = (id) => document.getElementById(id);
let actif = null, galerie = [], indexPhoto = 0, calque = 0; // calque : 0 = image A visible, 1 = image B visible

function afficherPhoto(i) {
  const ph = galerie[i]; if (!ph) return;
  // fondu enchaîné entre deux images superposées
  const [a, b] = calque ? [$('photo-b'), $('photo-a')] : [$('photo-a'), $('photo-b')]; // a visible, b suivante
  b.onload = () => { b.classList.remove('cache'); a.classList.add('cache'); };
  b.src = ph.src; b.alt = ph.legende;
  b.classList.toggle('document', ph.periode === 'autrefois');
  calque = 1 - calque;
  afficherPhotoInfos(i);
}

// textes de la fiche (rappelé au changement de langue, sans toucher à la photo affichée)
function textesFiche(id) {
  const m = parId[id];
  $('fiche-epoque').textContent = nomEpoque(m.epoque);
  $('fiche-epoque').style.color = epoques[m.epoque].color;
  $('fiche-nom').textContent = nom(id);
  $('fiche-dates').textContent = champ(id, 'dates');
  $('fiche-texte').textContent = champ(id, 'texte');
  for (const c of ['regarder', 'savez', 'visite']) {
    const v = champ(id, c) || '';
    $('bloc-' + c).hidden = !v;
    $('fiche-' + c).textContent = v;
  }
  if (m.lien) $('fiche-visite').insertAdjacentHTML('beforeend', ` <a href="${m.lien}" target="_blank" rel="noopener">${t('fiche.siteOfficiel')} ↗</a>`);
  $('fiche-sources').innerHTML = m.sources?.length
    ? `${t('fiche.sources')}${getLang() === 'fr' ? ' : ' : ': '}` + m.sources.map(([titre, url]) => `<a href="${url}" target="_blank" rel="noopener">${echap(titre)}</a>`).join(' · ')
    : '';
  lienMarche(id);
  galerie = photosDe(id);
  document.querySelector('.periodes [data-p="autrefois"]').textContent = galerie.find((p) => p.onglet)?.onglet || t('fiche.autrefois');
  $('vignettes').innerHTML = galerie.length > 1
    ? galerie.map((p, k) => `<button aria-label="${echap(t('fiche.photo', { n: k + 1, legende: p.legende }))}"><img src="${p.mini}" alt=""></button>`).join('')
    : '';
}

function ouvrir(id) {
  const m = parId[id]; if (!m) return;
  cacherApercu();
  textesFiche(id);

  // galerie : d'abord autrefois (du plus ancien au plus récent), puis aujourd'hui
  $('galerie').hidden = !galerie.length;
  const aAutrefois = galerie.some((p) => p.periode === 'autrefois');
  const aAujourdhui = galerie.some((p) => p.periode === 'aujourdhui');
  document.querySelector('.periodes').hidden = !(aAutrefois && aAujourdhui);
  $('photo-a').removeAttribute('src'); $('photo-b').removeAttribute('src');
  $('photo-a').classList.remove('cache'); $('photo-b').classList.add('cache'); calque = 0;
  if (galerie.length) {
    $('photo-a').src = galerie[0].src; $('photo-a').alt = galerie[0].legende;
    $('photo-a').classList.toggle('document', galerie[0].periode === 'autrefois');
    afficherPhotoInfos(0);
  }

  fiche.hidden = false;
  fiche.querySelector('.fiche-defile').scrollTop = 0;
  // relance l'animation de déploiement même si la fiche était déjà ouverte
  fiche.style.animation = 'none'; void fiche.offsetWidth; fiche.style.animation = '';
  document.body.classList.add('fiche-ouverte');
  reperes.get(actif)?.classList.remove('actif');
  reperes.get(id)?.classList.add('actif');
  actif = id;
  majListe();
  arreterTour();
  const mobile = innerWidth <= 640;
  map.flyTo({
    center: [m.at[1], m.at[0]], zoom: mobile ? 16.4 : 17, pitch: 62,
    bearing: map.getBearing() + 25, duration: 2200, essential: true,
    padding: mobile ? { bottom: innerHeight * 0.66, top: 70 } : { right: 440, left: panneau.hidden ? 320 : 400 },
  });
}
// met à jour légende, crédits, onglets et vignettes sans changer l'image (première ouverture)
function afficherPhotoInfos(i) {
  const ph = galerie[i]; indexPhoto = i;
  $('photo-legende').textContent = ph.legende;
  $('photo-credit').innerHTML = `${echap(ph.auteur)} · ${echap(ph.licence)} · <a href="${ph.source}" target="_blank" rel="noopener">Wikimedia Commons ↗</a>`;
  for (const btn of document.querySelectorAll('.periodes button')) btn.setAttribute('aria-selected', btn.dataset.p === ph.periode);
  document.querySelectorAll('#vignettes button').forEach((v, k) => v.classList.toggle('actif', k === i));
}

document.querySelector('.periodes').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const k = galerie.findIndex((p) => p.periode === b.dataset.p);
  if (k >= 0 && k !== indexPhoto) afficherPhoto(k);
});
$('vignettes').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const k = [...$('vignettes').children].indexOf(b);
  if (k !== indexPhoto) afficherPhoto(k);
});

function fermer() {
  fiche.hidden = true;
  document.body.classList.remove('fiche-ouverte');
  reperes.get(actif)?.classList.remove('actif');
  actif = null;
  majListe();
  map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 600 });
}
$('fiche-fermer').addEventListener('click', fermer);

// ---------- visionneuse plein écran ----------
const visionneuse = $('visionneuse');
function agrandir() {
  const ph = galerie[indexPhoto]; if (!ph) return;
  $('visionneuse-img').src = ph.src; $('visionneuse-img').alt = ph.legende;
  $('visionneuse-legende').innerHTML = `${echap(ph.legende)}<span class="credit">${echap(ph.auteur)} · ${echap(ph.licence)} · <a href="${ph.source}" target="_blank" rel="noopener">Wikimedia Commons ↗</a></span>`;
  visionneuse.hidden = false;
  $('visionneuse-fermer').focus();
}
$('agrandir').addEventListener('click', agrandir);
$('photo-a').addEventListener('click', agrandir);
$('photo-b').addEventListener('click', agrandir);
$('visionneuse-fermer').addEventListener('click', () => { visionneuse.hidden = true; });
visionneuse.addEventListener('click', (e) => { if (e.target === visionneuse) visionneuse.hidden = true; });
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!visionneuse.hidden) visionneuse.hidden = true;
    else if (!fiche.hidden) fermer();
    else if (!panneau.hidden) fermerPromenades();
  }
  if (!fiche.hidden && galerie.length > 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const k = (indexPhoto + (e.key === 'ArrowRight' ? 1 : -1) + galerie.length) % galerie.length;
    afficherPhoto(k);
    if (!visionneuse.hidden) agrandir();
  }
});

// ---------- « Vous êtes ici » : position du visiteur et monument le plus proche ----------
const btnGeo = $('btn-geo'), proche = $('proche'), message = $('message');
let suivi = null, pointIci = null, dejaCentre = false, minuterieMessage = null;
function afficherMessage(texte) {
  message.textContent = texte; message.hidden = false;
  clearTimeout(minuterieMessage); minuterieMessage = setTimeout(() => { message.hidden = true; }, 5000);
}
// distance à vol d'oiseau en mètres, puis détour moyen des rues (×1,3) pour estimer la marche
const MX = 111320 * Math.cos((44.84 * Math.PI) / 180), MY = 110540;
const distance = ([x1, y1], [x2, y2]) => Math.hypot((x1 - x2) * MX, (y1 - y2) * MY);
const dansZone = ([x, y]) => x > ZONE_BB[0][0] - 0.01 && x < ZONE_BB[1][0] + 0.01 && y > ZONE_BB[0][1] - 0.01 && y < ZONE_BB[1][1] + 0.01;
let positionIci = null;
function majProche() {
  if (!positionIci) return;
  let meilleur = null;
  for (const m of monuments) {
    if (m.hidePin) continue;
    const d = distance(positionIci, [m.at[1], m.at[0]]);
    if (!meilleur || d < meilleur.d) meilleur = { m, d };
  }
  const marche = meilleur.d * 1.3, minutes = Math.max(1, Math.round(marche / (marches.vitesse || 70)));
  proche.innerHTML = `<span class="pt" style="background:${epoques[meilleur.m.epoque].color}"></span>` +
    `<div><p class="kicker">${t('geo.proche')}</p><p class="proche-nom">${echap(nom(meilleur.m.id))}</p>` +
    `<p class="proche-temps">${t('geo.temps', { duree: duree(minutes), m: marche < 1000 ? Math.round(marche / 10) * 10 + ' m' : km(marche) })}</p></div>` +
    `<button data-m="${meilleur.m.id}">${t('geo.ouvrir')} →</button>`;
  proche.hidden = false;
}
function localiser(actif) {
  btnGeo.setAttribute('aria-pressed', String(actif));
  if (!actif) {
    if (suivi != null) navigator.geolocation.clearWatch(suivi);
    suivi = null; positionIci = null; dejaCentre = false;
    pointIci?.remove(); pointIci = null; proche.hidden = true;
    return;
  }
  if (!navigator.geolocation) { afficherMessage(t('geo.indispo')); return localiser(false); }
  suivi = navigator.geolocation.watchPosition((pos) => {
    const p = [pos.coords.longitude, pos.coords.latitude];
    if (!dansZone(p)) { afficherMessage(t('geo.loin')); return localiser(false); }
    positionIci = p;
    if (!pointIci) {
      const el = document.createElement('div');
      el.className = 'ici';
      el.innerHTML = '<span class="halo"></span><span class="point"></span>';
      el.title = t('geo.ici');
      pointIci = new maplibregl.Marker({ element: el }).setLngLat(p).addTo(map);
    } else pointIci.setLngLat(p);
    if (!dejaCentre) { dejaCentre = true; arreterTour(); map.flyTo({ center: p, zoom: Math.max(map.getZoom(), 16), duration: 1500, essential: true }); }
    majProche();
  }, (err) => {
    afficherMessage(t(err.code === 1 ? 'geo.refus' : 'geo.indispo'));
    localiser(false);
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
}
btnGeo.addEventListener('click', () => localiser(btnGeo.getAttribute('aria-pressed') !== 'true'));
proche.addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (b) ouvrir(b.dataset.m); });

// ---------- outils ----------
let tour = null;
function arreterTour() { if (tour) { cancelAnimationFrame(tour); tour = null; document.getElementById('btn-tour').setAttribute('aria-pressed', 'false'); } }
document.getElementById('btn-tour').addEventListener('click', (e) => {
  if (tour) return arreterTour();
  e.currentTarget.setAttribute('aria-pressed', 'true');
  let t0 = performance.now();
  const step = (t) => { map.setBearing(map.getBearing() + (t - t0) * 0.004); t0 = t; tour = requestAnimationFrame(step); };
  tour = requestAnimationFrame(step);
});
map.on('dragstart', arreterTour);
document.getElementById('btn-3d').addEventListener('click', (e) => {
  const plat = map.getPitch() > 5;
  map.easeTo({ pitch: plat ? 0 : VUE.pitch, bearing: plat ? 0 : VUE.bearing, duration: 900 });
  e.currentTarget.textContent = plat ? '3D' : '2D';
});
document.getElementById('btn-accueil').addEventListener('click', () => {
  if (!fiche.hidden) fermer();
  map.flyTo({ ...vueAccueil(), padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 1600 });
  document.getElementById('btn-3d').textContent = '2D';
});

// ---------- promenades à pied depuis l'hôtel ----------
const panneau = $('promenades'), contenu = $('pr-contenu');
const promenades = marches.promenades;
let promenade = null, dessin = null;
const ligne = (coords) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } });
const metres = (m) => (m < 1000 ? `${m} m` : km(m));

function listePromenades() {
  contenu.innerHTML =
    `<div class="pr-tete"><p class="kicker">${t('pr.kicker')}</p><h2>${t('pr.titre')}</h2>` +
    `<p class="pr-sous">${t('pr.sous')}</p></div>` +
    `<ul class="pr-liste">` + promenades.map((p) =>
      `<li><button data-pr="${p.id}">` +
      `<span class="pr-nom">${echap(tPromenade(p, 'nom'))}</span>` +
      `<span class="pr-meta">${t(p.boucle ? 'pr.boucle' : 'pr.aller')} · ${km(p.distance)} · ${duree(p.marche)}</span>` +
      `<span class="pr-intro">${echap(tPromenade(p, 'intro'))}</span>` +
      `<span class="pr-pastilles">${p.etapes.filter((e) => e.m !== 'hotel').map((e) => `<i style="background:${epoques[parId[e.m].epoque].color}" title="${echap(nom(e.m))}"></i>`).join('')}` +
      `<b>${t('pr.etapes', { n: p.etapes.filter((e) => e.m !== 'hotel').length })}</b></span>` +
      `</button></li>`).join('') + `</ul>`;
}

function detailPromenade(p) {
  let n = 0;
  const etapes = p.etapes.map((e) => {
    const hotelFin = e.m === 'hotel';
    const ep = hotelFin ? null : epoques[parId[e.m].epoque];
    const marche = `<li class="pr-marche"><span>${e.min} min · ${metres(e.depuis)}</span></li>`;
    const lieu = hotelFin
      ? `<li class="pr-lieu hotel"><span class="pt">H</span><div><strong>${t('pr.retourHotel')}</strong></div></li>`
      : `<li class="pr-lieu"><span class="pt" style="--c:${ep.color}">${++n}</span>` +
        `<button data-m="${e.m}"><strong>${echap(nom(e.m))}</strong><span>${echap(champ(e.m, 'apercu') || '')}</span></button></li>`;
    return marche + lieu;
  }).join('');
  contenu.innerHTML =
    `<button class="pr-retour" data-retour>${t('pr.retourListe')}</button>` +
    `<div class="pr-tete"><p class="kicker">${t(p.boucle ? 'pr.boucleDepuis' : 'pr.allerDepuis')}</p><h2>${echap(tPromenade(p, 'nom'))}</h2>` +
    `<p class="pr-chiffres"><span><b>${km(p.distance)}</b> ${t('pr.aPied')}</span><span><b>${duree(p.marche)}</b> ${t('pr.deMarche')}</span><span><b>${n}</b> ${t('pr.etapesCourt')}</span></p>` +
    `<p class="pr-sous">${echap(tPromenade(p, 'intro'))}</p></div>` +
    `<ol class="pr-etapes"><li class="pr-lieu hotel"><span class="pt">H</span><div><strong>${t('hotel')}</strong><span>${t('pr.depart')}</span></div></li>${etapes}</ol>` +
    `<p class="pr-fin">${echap(tPromenade(p, 'fin'))}</p>`;
}

function ouvrirPromenades() {
  if (!promenade) listePromenades();
  panneau.hidden = false;
  document.body.classList.add('promenades-ouvertes');
  $('btn-promenades').setAttribute('aria-expanded', 'true');
  panneau.style.animation = 'none'; void panneau.offsetWidth; panneau.style.animation = '';
  contenu.scrollTop = 0;
  placerListe();
}
function fermerPromenades() {
  panneau.hidden = true;
  document.body.classList.remove('promenades-ouvertes');
  $('btn-promenades').setAttribute('aria-expanded', 'false');
  if (promenade) map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 600 });
  choisirPromenade(null);
  placerListe();
}

function choisirPromenade(id) {
  promenade = promenades.find((p) => p.id === id) || null;
  cancelAnimationFrame(dessin);
  // repères : numéro d'étape sur ceux du parcours, les autres s'effacent
  document.body.classList.toggle('en-promenade', !!promenade);
  for (const [mid, el] of reperes) {
    if (mid === 'hotel') continue;
    const k = promenade ? promenade.etapes.findIndex((e) => e.m === mid) : -1;
    const tete = el.querySelector('.tete');
    tete.dataset.chiffre ??= tete.textContent;
    tete.textContent = k >= 0 ? k + 1 : tete.dataset.chiffre;
    el.classList.toggle('etape', k >= 0);
  }
  const src = map.getSource('promenade');
  if (!promenade) { src?.setData(ligne([])); if (!panneau.hidden) listePromenades(); return; }
  detailPromenade(promenade);
  contenu.scrollTop = 0;
  arreterTour();
  if (!fiche.hidden) fermer();

  // cadrage sur le parcours, en laissant la place au panneau
  const t = promenade.trace;
  const bb = t.reduce((b, [x, y]) => [[Math.min(b[0][0], x), Math.min(b[0][1], y)], [Math.max(b[1][0], x), Math.max(b[1][1], y)]], [[180, 90], [-180, -90]]);
  const mobile = innerWidth <= 640;
  const padding = mobile ? { top: 76, bottom: panneau.offsetHeight + 16, left: 24, right: 24 } : { top: 70, bottom: 70, left: 420, right: 80 };
  // orientation habituelle, sauf si une autre montre nettement mieux un parcours tout en longueur
  const zoomPour = (bearing) => map.cameraForBounds(bb, { padding, bearing, pitch: 45 })?.zoom ?? 0;
  let bearing = VUE.bearing, zoom = zoomPour(bearing);
  for (const b of [0, -60]) { const z = zoomPour(b); if (z > zoom + 0.35) { bearing = b; zoom = z; } }
  // centre du parcours + marges passées à la caméra (cameraForBounds décale mal le centre quand la vue est tournée)
  const centre = [(bb[0][0] + bb[1][0]) / 2, (bb[0][1] + bb[1][1]) / 2];
  map.flyTo({ center: centre, zoom, bearing, pitch: 45, padding, duration: 1500, essential: true });

  // le tracé se dessine progressivement, de l'hôtel vers la dernière étape
  const t0 = performance.now() + 900, dureeDessin = 1800;
  const pas = (now) => {
    const f = Math.min(1, Math.max(0, (now - t0) / dureeDessin));
    const e = 1 - (1 - f) ** 2;
    src.setData(ligne(t.slice(0, Math.max(2, Math.ceil(e * t.length)))));
    if (f < 1) dessin = requestAnimationFrame(pas);
  };
  dessin = requestAnimationFrame(pas);
}

contenu.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.pr) choisirPromenade(b.dataset.pr);
  else if (b.dataset.retour !== undefined) choisirPromenade(null);
  else if (b.dataset.m) ouvrir(b.dataset.m);
});
$('btn-promenades').addEventListener('click', () => (panneau.hidden ? ouvrirPromenades() : fermerPromenades()));
$('promenades-fermer').addEventListener('click', fermerPromenades);
if (!promenades.length) $('btn-promenades').hidden = true;

// dans la fiche : temps de marche depuis l'hôtel et promenades qui passent par ce monument
function lienMarche(id) {
  const d = marches.depuisHotel[id];
  const sur = promenades.filter((p) => p.etapes.some((e) => e.m === id));
  $('fiche-liens').innerHTML =
    (d ? `<span class="fl-temps">${t('fiche.marche', { duree: duree(d.min), km: km(d.m) })}</span>` : '') +
    sur.map((p) => `<button class="fl-promenade" data-pr="${p.id}">${echap(t('fiche.promenade', { nom: tPromenade(p, 'nom') }))}</button>`).join('');
}
$('fiche-liens').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-pr]'); if (!b) return;
  ouvrirPromenades();
  choisirPromenade(b.dataset.pr);
});

// ---------- liste des monuments (repliable, visible en permanence) ----------
const liste = $('liste'), listeCorps = $('liste-corps'), btnListe = $('liste-bascule');
function dessinerListe() {
  const visibles = monuments.filter((m) => !m.hidePin);
  $('liste-nb').textContent = visibles.length;
  listeCorps.innerHTML = Object.keys(epoques).map((k) => {
    const ms = visibles.filter((m) => m.epoque === k);
    if (!ms.length) return '';
    return `<p class="liste-ep" style="color:${epoques[k].color}">${nomEpoque(k)}</p>` + ms.map((m) => {
      const d = marches.depuisHotel[m.id];
      return `<button class="liste-m" data-m="${m.id}"><i style="background:${epoques[k].color}"></i>` +
        `<span>${echap(nom(m.id))}</span>${d ? `<small>${duree(d.min)}</small>` : ''}</button>`;
    }).join('');
  }).join('');
  majListe();
}
// monument ouvert en surbrillance, époques masquées par la légende estompées
function majListe() {
  for (const b of listeCorps.querySelectorAll('.liste-m')) {
    b.classList.toggle('actif', b.dataset.m === actif);
    if (b.dataset.m === actif) {
      b.setAttribute('aria-current', 'true');
      // la ligne reste visible : défilement de la liste seule (scrollIntoView bougerait aussi la page)
      const y = b.offsetTop - listeCorps.offsetTop, c = listeCorps;
      if (listeOuverte && (y < c.scrollTop || y + b.offsetHeight > c.scrollTop + c.clientHeight)) {
        c.scrollTo({ top: y - (c.clientHeight - b.offsetHeight) / 2, behavior: 'smooth' });
      }
    } else b.removeAttribute('aria-current');
    b.classList.toggle('estompe', !actives.has(parId[b.dataset.m].epoque));
  }
}
// ouverte par défaut sur ordinateur, repliée sur téléphone ; le choix est retenu
let listeOuverte = (() => {
  try { const v = localStorage.getItem('pl.liste'); if (v) return v === '1'; } catch { /* stockage indisponible */ }
  return innerWidth > 640;
})();
function basculerListe(ouverte = !listeOuverte, memoriser = true) {
  listeOuverte = ouverte;
  liste.classList.toggle('repliee', !ouverte);
  btnListe.setAttribute('aria-expanded', String(ouverte));
  btnListe.title = t(ouverte ? 'liste.masquer' : 'liste.afficher');
  if (memoriser) try { localStorage.setItem('pl.liste', ouverte ? '1' : '0'); } catch { /* stockage indisponible */ }
  placerListe();
}
// la liste occupe la place libre sous le cartouche (ou sous le panneau des promenades)
function placerListe() {
  const H = innerHeight, bas = 30, marge = 12, tete = btnListe.offsetHeight || 44;
  if (innerWidth <= 640) { listeCorps.style.maxHeight = Math.round(H * 0.5) + 'px'; panneau.style.maxHeight = ''; return; }
  if (!panneau.hidden) {
    const corps = listeOuverte ? Math.min(listeCorps.scrollHeight, H * 0.38 - tete) : 0;
    listeCorps.style.maxHeight = Math.max(80, corps) + 'px';
    panneau.style.maxHeight = (H - 18 - bas - tete - (listeOuverte ? Math.max(80, corps) : 0) - marge) + 'px';
  } else {
    panneau.style.maxHeight = '';
    const haut = $('titre').getBoundingClientRect().bottom;
    listeCorps.style.maxHeight = Math.max(110, H - haut - marge - bas - tete) + 'px';
  }
}
btnListe.addEventListener('click', () => basculerListe());
listeCorps.addEventListener('click', (e) => { const b = e.target.closest('.liste-m'); if (b) ouvrir(b.dataset.m); });
// survol d'une ligne : le repère correspondant grossit sur la carte
listeCorps.addEventListener('mouseover', (e) => {
  const b = e.target.closest('.liste-m');
  for (const [id, el] of reperes) el.classList.toggle('survol', !!b && id === b.dataset.m);
});
listeCorps.addEventListener('mouseleave', () => { for (const el of reperes.values()) el.classList.remove('survol'); });
addEventListener('resize', placerListe);
document.fonts?.ready.then(placerListe);
dessinerListe();
basculerListe(listeOuverte, false);

// ---------- langue ----------
const btnLangue = $('btn-langue'), menuLangue = $('menu-langue');
const libelleLangue = () => {
  btnLangue.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18"/></svg><b>${getLang().toUpperCase()}</b>`;
  btnLangue.setAttribute('aria-label', `${t('langue.titre')} (${getLang().toUpperCase()})`);
};
libelleLangue();
function menuOuvert(ouvert = menuLangue.hidden) {
  if (ouvert) {
    menuLangue.innerHTML = LANGS.map((l) => `<button role="menuitemradio" aria-checked="${l.code === getLang()}" data-lang="${l.code}" lang="${l.code}"><span>${l.flag}</span>${l.name}</button>`).join('');
  }
  menuLangue.hidden = !ouvert;
  btnLangue.setAttribute('aria-expanded', String(ouvert));
}
btnLangue.addEventListener('click', (e) => { e.stopPropagation(); menuOuvert(); });
document.addEventListener('click', (e) => { if (!menuLangue.hidden && !e.target.closest('.langue')) menuOuvert(false); });
menuLangue.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-lang]'); if (!b) return;
  menuOuvert(false);
  await setLang(b.dataset.lang);
  traduirePage();
});
// réécrit tout ce qui est affiché, sans bouger la carte ni la photo en cours
function traduirePage() {
  applyStatic();
  libelleLangue();
  dessinerLegende();
  for (const [id, el] of reperes) {
    const n = nom(id);
    el.querySelector('.nom').textContent = n;
    el.setAttribute('aria-label', n);
  }
  apercuId = null;
  if (actif) { textesFiche(actif); if (galerie[indexPhoto]) afficherPhotoInfos(indexPhoto); }
  if (!panneau.hidden) { if (promenade) detailPromenade(promenade); else listePromenades(); }
  dessinerListe();
  basculerListe(listeOuverte, false);
  majProche();
  if (pointIci) pointIci.getElement().title = t('geo.ici');
}

function intro() {
  const v = vueAccueil();
  if (CAPTURE) return map.jumpTo(VUE_IMPOSEE || v);
  map.jumpTo({ ...v, zoom: v.zoom - 0.6, bearing: v.bearing - 40, pitch: 30 });
  map.flyTo({ ...v, duration: 3200, essential: true });
}

// accès console pour les essais
window.map = map;
