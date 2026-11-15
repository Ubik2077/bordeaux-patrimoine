#!/usr/bin/env node
// Assemble les fichiers de la carte à partir des données brutes (scripts/fetch.mjs) :
//   data/zone.json       → contour de « l'île » (forme libre qui découpe la carte)
//   data/batiments.json  → bâtiments en volume (hauteur IGN), monuments, flèches dessinées
//   data/sol.json        → Garonne, parcs, places, rues (découpés sur l'île)
//   data/arbres.json     → arbres (houppiers en volume)
//   data/monuments.json  → fiches des monuments phares + époques + hôtel

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'polygon-clipping';
import os from 'node:os';
import { MONUMENTS, EPOQUES } from './monuments.mjs';

const RAW = path.join(os.tmpdir(), 'bordeaux-patrimoine-raw'); // même dossier que fetch.mjs

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = (f) => path.join(ROOT, 'data', f);
const raw = async (f) => JSON.parse(await readFile(path.join(RAW, f + '.json'), 'utf8'));

const HOTEL = { name: 'Ibis Bordeaux Centre Gare Saint-Jean Euratlantique', at: [44.82654, -0.55693] };

// ---------- géométrie ----------
const LAT0 = 44.84;
const MX = 111320 * Math.cos((LAT0 * Math.PI) / 180); // m par degré de longitude
const MY = 110540; // m par degré de latitude
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const r5 = (x) => Math.round(x * 1e5) / 1e5;

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(a / 2) * MX * MY;
}
function centroid(r) {
  let x = 0, y = 0, n = r.length - 1 || 1;
  for (let i = 0; i < n; i++) { x += r[i][0]; y += r[i][1]; }
  return [x / n, y / n];
}
function inRing([x, y], r) {
  let ins = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
const inPoly = (p, poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h));
function bbox(r) {
  let a = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of r) a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)];
  return a;
}
// supprime les points presque alignés (allège les fichiers sans changer la forme)
function simplify(r, tol = 0.25) {
  if (r.length < 5) return r;
  const out = [r[0]];
  for (let i = 1; i < r.length - 1; i++) {
    const a = out[out.length - 1], b = r[i], c = r[i + 1];
    const ax = (b[0] - a[0]) * MX, ay = (b[1] - a[1]) * MY, cx = (c[0] - a[0]) * MX, cy = (c[1] - a[1]) * MY;
    const len = Math.hypot(cx, cy) || 1;
    if (Math.abs(ax * cy - ay * cx) / len > tol) out.push(b);
  }
  out.push(r[r.length - 1]);
  return out.length >= 4 ? out : r;
}
// polygone régulier autour d'un point (rayon en mètres)
function around([x, y], radius, sides = 8, rot = Math.PI / 8) {
  const ring = [];
  for (let i = 0; i <= sides; i++) {
    const a = rot + (i % sides) * ((2 * Math.PI) / sides);
    ring.push([r6(x + (Math.cos(a) * radius) / MX), r6(y + (Math.sin(a) * radius) / MY)]);
  }
  return [ring];
}

// ---------- l'île : courbe lissée (Catmull-Rom) passant par des points choisis à la main ----------
const CTRL = [
  [-0.5522, 44.8672], [-0.5442, 44.8652], [-0.5448, 44.8585], [-0.5492, 44.8505], [-0.5532, 44.8428],
  [-0.5538, 44.8348], [-0.5512, 44.8268], [-0.5578, 44.8212], [-0.5662, 44.8234], [-0.5770, 44.8260],
  [-0.5868, 44.8322], [-0.5935, 44.8410], [-0.5918, 44.8497], [-0.5828, 44.8552], [-0.5712, 44.8586],
  [-0.5624, 44.8636],
];
function catmull(pts, seg = 14) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < seg; s++) {
      const t = s / seg, t2 = t * t, t3 = t2 * t;
      const f = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([r6(f(0)), r6(f(1))]);
    }
  }
  out.push(out[0]);
  return out;
}
const ZONE = catmull(CTRL);
const ZB = bbox(ZONE);
const inZone = (p) => p[0] >= ZB[0] && p[0] <= ZB[2] && p[1] >= ZB[1] && p[1] <= ZB[3] && inRing(p, ZONE);

// découpe d'une ligne sur l'île
function segInter(a, b, c, d) {
  const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  if (!den) return null;
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
  const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] : null;
}
function cross(a, b) {
  for (let i = 0; i < ZONE.length - 1; i++) { const p = segInter(a, b, ZONE[i], ZONE[i + 1]); if (p) return p; }
  return b;
}
function clipLine(line) {
  const parts = [];
  let cur = null;
  for (let i = 0; i < line.length; i++) {
    const p = line[i], ins = inZone(p);
    if (ins) {
      if (!cur) { cur = i > 0 ? [cross(line[i - 1], p)] : []; }
      cur.push(p);
    } else if (cur) {
      cur.push(cross(line[i - 1], p));
      if (cur.length > 1) parts.push(cur);
      cur = null;
    }
  }
  if (cur && cur.length > 1) parts.push(cur);
  return parts;
}
const clipPoly = (poly) => { try { return pc.intersection(poly, [ZONE]); } catch { return []; } };

// ---------- OSM : élément → polygones ----------
function joinWays(ways) {
  const rings = [], pool = ways.map((w) => w.slice());
  while (pool.length) {
    let ring = pool.shift();
    let guard = 0;
    while (ring.length > 1 && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) && guard++ < 500) {
      const end = ring.at(-1);
      const k = pool.findIndex((w) => (w[0][0] === end[0] && w[0][1] === end[1]) || (w.at(-1)[0] === end[0] && w.at(-1)[1] === end[1]));
      if (k < 0) break;
      const w = pool.splice(k, 1)[0];
      ring = ring.concat(w[0][0] === end[0] && w[0][1] === end[1] ? w.slice(1) : w.reverse().slice(1));
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}
function osmPolys(e) {
  const g = (geom) => geom.map((p) => [p.lon, p.lat]);
  if (e.type === 'way' && e.geometry) {
    const r = g(e.geometry);
    return r.length >= 4 && r[0][0] === r.at(-1)[0] && r[0][1] === r.at(-1)[1] ? [[r]] : [];
  }
  if (e.type === 'relation' && e.members) {
    const outer = joinWays(e.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => g(m.geometry)));
    const inner = joinWays(e.members.filter((m) => m.type === 'way' && m.role === 'inner' && m.geometry).map((m) => g(m.geometry)));
    return outer.map((o) => [o, ...inner.filter((i) => inRing(i[0], o))]);
  }
  return [];
}

// petite grille spatiale pour trouver vite le polygone qui contient un point
class Grid {
  constructor(cell = 0.002) { this.cell = cell; this.m = new Map(); }
  key(x, y) { return Math.floor(x / this.cell) + ':' + Math.floor(y / this.cell); }
  add(item, bb) {
    for (let x = Math.floor(bb[0] / this.cell); x <= Math.floor(bb[2] / this.cell); x++)
      for (let y = Math.floor(bb[1] / this.cell); y <= Math.floor(bb[3] / this.cell); y++) {
        const k = x + ':' + y;
        if (!this.m.has(k)) this.m.set(k, []);
        this.m.get(k).push(item);
      }
  }
  at(p) { return this.m.get(this.key(p[0], p[1])) || []; }
}

// ---------- 1. patrimoine ----------
const patri = (await raw('osm-patrimoine')).elements;
const byId = new Map(patri.map((e) => [e.type[0] + e.id, e]));
const heroOf = new Map();
for (const m of MONUMENTS) for (const id of m.osm) heroOf.set(id, m);

const heritageGrid = new Grid();
const heritageNodes = [];
let nbHeritage = 0;
for (const e of patri) {
  const t = e.tags || {};
  const hero = heroOf.get(e.type[0] + e.id);
  const protege = t['ref:mhs'] || t.heritage;
  if (!hero && !protege) continue;
  if (e.type === 'node') { if (t['ref:mhs']) heritageNodes.push({ p: [e.lon, e.lat], ref: t['ref:mhs'] }); continue; }
  for (const poly of osmPolys(e)) {
    heritageGrid.add({ poly, hero, ref: t['ref:mhs'] || '', name: t.name || '' }, bbox(poly[0]));
    nbHeritage++;
  }
}
// les monuments phares absents des tags patrimoniaux (ex. Cité du Vin) : on ajoute leur emprise
for (const m of MONUMENTS) for (const id of m.osm) {
  const e = byId.get(id);
  if (!e || e.tags?.['ref:mhs'] || e.tags?.heritage) continue;
  for (const poly of osmPolys(e)) heritageGrid.add({ poly, hero: m, ref: '', name: m.name }, bbox(poly[0]));
}
const heroAt = (p) => heritageGrid.at(p).filter((h) => inPoly(p, h.poly)).sort((a, b) => (b.hero ? 1 : 0) - (a.hero ? 1 : 0))[0];

// ---------- 2. bâtiments IGN ----------
const ign = (await raw('ign-batiment')).features;
const feats = [];
const heroHit = new Set();
for (const f of ign) {
  const p = f.properties;
  if (p.construction_legere) continue;
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const poly0 of polys) {
    const poly = poly0.map((r) => r.map(([x, y]) => [x, y]));
    const area = ringArea(poly[0]);
    if (area < 12) continue;
    const c = centroid(poly[0]);
    if (!inZone(c)) continue;
    let h = p.hauteur > 0 ? p.hauteur : p.nombre_d_etages ? p.nombre_d_etages * 3 + 2 : 6;
    const her = heroAt(c);
    const props = { h: Math.round(Math.max(h, 2.5) * 10) / 10 };
    if (her) {
      if (her.ref) props.r = her.ref;
      if (her.hero) {
        props.m = her.hero.id; props.e = her.hero.epoque; heroHit.add(her.hero.id);
        if (her.hero.h) props.h = her.hero.h;
      }
    } else {
      const n = heritageNodes.find((n) => Math.abs(n.p[0] - c[0]) < 0.0006 && Math.abs(n.p[1] - c[1]) < 0.0006 && inPoly(n.p, poly));
      if (n) props.r = n.ref;
    }
    feats.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: poly.map((r) => simplify(r).map(([x, y]) => [r6(x), r6(y)])) } });
  }
}

// monuments sans bâtiment IGN (ruines, ponts, flèche…) : on extrude l'emprise OSM
const heroGeom = (m) => m.osm.flatMap((id) => (byId.get(id) ? osmPolys(byId.get(id)) : []));
for (const m of MONUMENTS) {
  if (heroHit.has(m.id) && !m.bridge) continue;
  if (m.spire === 'fleche') continue; // dessinée plus bas
  const h = m.bridge ? 7 : m.id === 'gallien' ? 9 : m.spire === 'colonne' ? 1.2 : 8;
  for (const poly of heroGeom(m))
    feats.push({ type: 'Feature', properties: { h, m: m.id, e: m.epoque, ...(m.bridge ? { b: m.id === 'chaban' ? 9 : 5 } : {}) }, geometry: { type: 'Polygon', coordinates: poly.map((r) => r.map(([x, y]) => [r6(x), r6(y)])) } });
}

// flèches et couronnements dessinés (empilement d'octogones de plus en plus fins)
function spire(c, m, from, to, r0, r1, steps, sides = 8) {
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    feats.push({ type: 'Feature', properties: { b: Math.round(from + (to - from) * t), h: Math.round(from + (to - from) * (i + 1) / steps), m: m.id, e: m.epoque, s: 1 },
      geometry: { type: 'Polygon', coordinates: around(c, r0 + (r1 - r0) * t, sides) } });
  }
}
const M = Object.fromEntries(MONUMENTS.map((m) => [m.id, m]));
{ // flèche Saint-Michel : tour carrée puis flèche octogonale jusqu'à 114 m
  const m = M.fleche, poly = heroGeom(m)[0], c = centroid(poly[0]);
  feats.push({ type: 'Feature', properties: { h: 47, m: m.id, e: m.epoque }, geometry: { type: 'Polygon', coordinates: poly } });
  spire(c, m, 47, 56, 4.6, 4.2, 1);
  spire(c, m, 56, 114, 4.0, 0.25, 14);
}
{ // tour Pey-Berland : lanterne et statue au-dessus de la tour (66 m)
  const m = M.peyberland, c = centroid(heroGeom(m)[0][0]);
  spire(c, m, 50, 58, 3.4, 3.0, 2);
  spire(c, m, 58, 62, 2.2, 1.8, 1);
  spire(c, m, 62, 66, 0.9, 0.5, 1, 6);
}
{ // cathédrale : les deux flèches du portail nord (81 m)
  const m = M.cathedrale, ring = heroGeom(m)[0][0];
  const maxLat = Math.max(...ring.map((p) => p[1]));
  const front = ring.filter((p) => (maxLat - p[1]) * MY < 7);
  const xs = front.map((p) => p[0]);
  const y = maxLat - 4.5 / MY;
  for (const x of [Math.min(...xs) + 4.5 / MX, Math.max(...xs) - 4.5 / MX]) {
    feats.push({ type: 'Feature', properties: { h: 50, m: m.id, e: m.epoque, s: 1 }, geometry: { type: 'Polygon', coordinates: around([x, y], 4.2, 4, Math.PI / 4) } });
    spire([x, y], m, 50, 81, 3.6, 0.2, 10);
  }
}
{ // colonne des Girondins (43 m)
  const m = M.girondins, c = centroid(heroGeom(m)[0][0]);
  spire(c, m, 0, 9, 6, 5, 2, 12);
  spire(c, m, 9, 40, 1.7, 1.4, 1, 12);
  spire(c, m, 40, 43, 1.2, 0.5, 1, 8);
}

const bati = { type: 'FeatureCollection', features: feats };

// ---------- 3. sol : eau, verdure, places, rues ----------
const sol = [];
for (const f of (await raw('ign-eau')).features) {
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const poly of polys) for (const cp of clipPoly(poly.map((r) => r.map(([x, y]) => [x, y]))))
    sol.push({ type: 'Feature', properties: { t: 'eau' }, geometry: { type: 'Polygon', coordinates: cp.map((r) => r.map(([x, y]) => [r5(x), r5(y)])) } });
}
const vert = (await raw('osm-vert')).elements;
const trees = [];
for (const e of vert) {
  const t = e.tags || {};
  if (e.type === 'node') { if (t.natural === 'tree' && inZone([e.lon, e.lat])) trees.push([e.lon, e.lat]); continue; }
  const kind = t.leisure || t.landuse ? 'vert' : 'place';
  for (const poly of osmPolys(e)) for (const cp of clipPoly(poly))
    sol.push({ type: 'Feature', properties: { t: kind }, geometry: { type: 'Polygon', coordinates: cp.map((r) => r.map(([x, y]) => [r5(x), r5(y)])) } });
}
sol.sort((a, b) => ['place', 'vert', 'eau'].indexOf(a.properties.t) - ['place', 'vert', 'eau'].indexOf(b.properties.t));
for (const f of (await raw('ign-route')).features) {
  const p = f.properties;
  if (Number(p.position_par_rapport_au_sol) < 0) continue;
  const imp = Number(p.importance) || 6;
  const w = /Sentier|Escalier|Chemin/.test(p.nature) || imp >= 6 ? 0 : imp >= 5 ? 1 : imp >= 3 ? 2 : 3;
  const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const l of lines) for (const part of clipLine(l.map(([x, y]) => [x, y])))
    sol.push({ type: 'Feature', properties: { t: 'rue', w }, geometry: { type: 'LineString', coordinates: part.map(([x, y]) => [r5(x), r5(y)]) } });
}

// ---------- 4. arbres : petit houppier hexagonal surélevé (effet « sucette » de maquette) ----------
const arbres = { type: 'FeatureCollection', features: trees.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: around(p, 3.3, 6, 0) } })) };

// ---------- écriture ----------
const write = async (f, obj) => { const s = JSON.stringify(obj); await writeFile(OUT(f), s); console.log(`✓ ${f.padEnd(16)} ${(s.length / 1e6).toFixed(2)} Mo`); };
await write('zone.json', { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ZONE] } });
await write('batiments.json', bati);
await write('sol.json', { type: 'FeatureCollection', features: sol });
await write('arbres.json', arbres);
await write('monuments.json', {
  epoques: EPOQUES,
  hotel: HOTEL,
  monuments: MONUMENTS.map(({ osm, h, spire, ...m }) => m),
});
console.log(`  ${feats.length} volumes, ${feats.filter((f) => f.properties.r).length} protégés MH, ${nbHeritage} emprises patrimoniales, ${trees.length} arbres`);
const missing = MONUMENTS.filter((m) => !feats.some((f) => f.properties.m === m.id)).map((m) => m.id);
if (missing.length) console.log('  ⚠ monuments sans volume :', missing.join(', '));
