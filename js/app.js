// Port de la Lune — prototype de carte 3D des monuments historiques de Bordeaux.
/* global maplibregl */

const COUL = {
  sol: '#e2dfd7', socle: '#cfc6b5', socle2: '#b9ae99',
  place: '#f4f2ec', vert: '#c3d59f', eau: '#94c3e4', rue: '#ffffff',
  bati: '#f7f6f2', protege: '#e6d3a6', arbre: '#8fb46b',
};
const VUE = { center: [-0.5705, 44.8435], zoom: 13.2, pitch: 52, bearing: -28 };

const json = (u) => fetch(u).then((r) => r.json());
const [zone, meta] = await Promise.all([json('data/zone.json'), json('data/monuments.json')]);
const { epoques, monuments, hotel } = meta;
const parId = Object.fromEntries(monuments.map((m) => [m.id, m]));
const ZONE_BB = zone.geometry.coordinates[0].reduce((b, [x, y]) => [[Math.min(b[0][0], x), Math.min(b[0][1], y)], [Math.max(b[1][0], x), Math.max(b[1][1], y)]], [[180, 90], [-180, -90]]);

// vue d'ensemble : toute l'île, en laissant la place au cartouche du titre
function vueAccueil() {
  const mobile = innerWidth <= 640;
  const padding = { top: 30, bottom: 30, left: 350, right: 60 };
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

map.on('load', () => {
  map.setLight({ anchor: 'viewport', color: '#ffffff', intensity: 0.42, position: [1.4, 200, 38] });

  map.addSource('zone', { type: 'geojson', data: zone });
  map.addSource('sol', { type: 'geojson', data: 'data/sol.json' });
  map.addSource('bati', { type: 'geojson', data: 'data/batiments.json' });
  map.addSource('arbres', { type: 'geojson', data: 'data/arbres.json' });

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

  // clic sur un volume : fiche du monument phare, ou petite bulle pour un bâtiment protégé
  map.on('click', 'bati', (ev) => {
    const p = ev.features[0].properties;
    if (p.m) return ouvrir(p.m === 'fleche' ? 'saintmichel' : p.m);
    if (p.r) {
      new maplibregl.Popup({ closeButton: false, maxWidth: '260px' })
        .setLngLat(ev.lngLat)
        .setHTML(`<strong>Monument historique</strong><br>Bâtiment protégé au titre des monuments historiques.<br><a href="${notice(p.r)}" target="_blank" rel="noopener">Notice officielle ${p.r} ↗</a>`)
        .addTo(map);
    }
  });
  map.on('mousemove', 'bati', (ev) => { const p = ev.features[0].properties; map.getCanvas().style.cursor = p.m || p.r ? 'pointer' : ''; });
  map.on('mouseleave', 'bati', () => { map.getCanvas().style.cursor = ''; });

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
    const el = repere({ id: m.id, at: m.at, color: epoques[m.epoque].color, label: m.name, initiale: chiffres[m.epoque] });
    const go = (e) => { e.stopPropagation(); ouvrir(m.id); };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(e); });
    reperes.set(m.id, el);
  }
  const h = repere({ at: hotel.at, color: '#22252b', label: 'Votre hôtel', initiale: 'H', classe: 'hotel' });
  h.addEventListener('click', (e) => { e.stopPropagation(); map.flyTo({ center: [hotel.at[1], hotel.at[0]], zoom: 16.5, pitch: 60, duration: 1600 }); });

  const noms = () => document.body.classList.toggle('noms-visibles', map.getZoom() >= 15.4);
  map.on('zoom', noms); noms();
}

// ---------- légende par époque ----------
const actives = new Set(Object.keys(epoques));
function legende() {
  const box = document.getElementById('legende');
  const compte = {};
  for (const m of monuments) if (!m.hidePin) compte[m.epoque] = (compte[m.epoque] || 0) + 1;
  box.innerHTML = Object.entries(epoques).map(([k, ep]) =>
    `<button data-k="${k}" aria-pressed="true"><span class="pastille" style="background:${ep.color}"></span>${ep.label}<span class="nb">${compte[k] || 0}</span></button>`).join('') +
    `<div class="sep"></div><div class="info"><span class="pastille" style="background:${COUL.protege}"></span>Autre bâtiment protégé</div>`;
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
    map.setPaintProperty('bati', 'fill-extrusion-color', couleurBati(actives));
    for (const [id, el] of reperes) el.classList.toggle('estompe', !actives.has(parId[id].epoque));
  });
}
legende();

// ---------- fiche ----------
const fiche = document.getElementById('fiche');
let actif = null;
function ouvrir(id) {
  const m = parId[id]; if (!m) return;
  const ep = epoques[m.epoque];
  document.getElementById('fiche-epoque').textContent = ep.label;
  document.getElementById('fiche-epoque').style.color = ep.color;
  document.getElementById('fiche-nom').textContent = m.name;
  document.getElementById('fiche-dates').textContent = m.dates;
  document.getElementById('fiche-texte').textContent = m.texte;
  document.getElementById('fiche-liens').innerHTML = 'Bientôt : photos, itinéraire depuis l\'hôtel, horaires de visite.';
  fiche.hidden = false;
  document.body.classList.add('fiche-ouverte');
  reperes.get(actif)?.classList.remove('actif');
  reperes.get(id)?.classList.add('actif');
  actif = id;
  arreterTour();
  const mobile = innerWidth <= 640;
  map.flyTo({
    center: [m.at[1], m.at[0]], zoom: mobile ? 16.4 : 17, pitch: 62,
    bearing: map.getBearing() + 25, duration: 2200, essential: true,
    padding: mobile ? { bottom: innerHeight * 0.45, top: 110 } : { right: 380, left: 320 },
  });
}
function fermer() {
  fiche.hidden = true;
  document.body.classList.remove('fiche-ouverte');
  reperes.get(actif)?.classList.remove('actif');
  actif = null;
  map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 600 });
}
document.getElementById('fiche-fermer').addEventListener('click', fermer);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !fiche.hidden) fermer(); });

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
  map.flyTo({ ...vueAccueil(), duration: 1600 });
  document.getElementById('btn-3d').textContent = '2D';
});

function intro() {
  const v = vueAccueil();
  map.jumpTo({ ...v, zoom: v.zoom - 0.6, bearing: v.bearing - 40, pitch: 30 });
  map.flyTo({ ...v, duration: 3200, essential: true });
}

// accès console pour les essais
window.map = map;
