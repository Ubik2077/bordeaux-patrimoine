#!/usr/bin/env node
// Promenades à pied depuis l'hôtel : calcule les tracés sur le réseau des rues (IGN BD TOPO,
// téléchargé par scripts/fetch.mjs) et écrit data/promenades.json.
// Calcule aussi le temps de marche entre l'hôtel et chaque monument (affiché dans les fiches).
//
// Usage : node scripts/promenades.mjs

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { MONUMENTS } from './monuments.mjs';

const RAW = path.join(os.tmpdir(), 'bordeaux-patrimoine-raw');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOTEL = [-0.55693, 44.82654]; // [lon, lat], comme dans build.mjs
const VITESSE = 70; // mètres par minute (≈ 4,2 km/h, allure de promenade)

// L'ordre des étapes est l'ordre de visite. boucle : le tracé revient à l'hôtel.
export const PROMENADES = [
  {
    id: 'medieval',
    nom: 'Le Bordeaux médiéval',
    boucle: true,
    intro: "Des ruelles de Saint-Michel au quartier de la cathédrale : églises gothiques, portes de l'ancienne enceinte et le beffroi de la Grosse Cloche.",
    etapes: ['saintecroix', 'saintmichel', 'bourgogne', 'grossecloche', 'peyberland', 'cathedrale', 'aquitaine'],
    fin: "Retour à l'hôtel à pied.",
  },
  {
    id: 'lumieres',
    nom: 'Le Port de la Lune',
    boucle: false,
    intro: "Le long de la Garonne, la façade du XVIIIᵉ siècle qui a valu à Bordeaux son classement à l'UNESCO, jusqu'à la place des Quinconces.",
    etapes: ['pontdepierre', 'cailhau', 'bourse', 'grandtheatre', 'girondins'],
    fin: 'Retour en tram C, de l’arrêt Quinconces jusqu’à la gare Saint-Jean.',
  },
  {
    id: 'antique',
    nom: 'Sur les traces de Burdigala',
    boucle: false,
    intro: "À travers le centre jusqu'aux plus anciens vestiges de la ville : la nécropole des premiers chrétiens et l'amphithéâtre romain.",
    etapes: ['aquitaine', 'rohan', 'seurin', 'gallien'],
    fin: 'Retour à pied, ou en tram C depuis la place des Quinconces, à un quart d’heure de marche.',
  },
];

// ---------- réseau piéton ----------
const LAT0 = 44.84;
const MX = 111320 * Math.cos((LAT0 * Math.PI) / 180), MY = 110540;
const dist = (a, b) => Math.hypot((a[0] - b[0]) * MX, (a[1] - b[1]) * MY);
const cle = ([x, y]) => `${x.toFixed(7)},${y.toFixed(7)}`;

const routes = JSON.parse(await readFile(path.join(RAW, 'ign-route.json'), 'utf8')).features;
const noeuds = new Map(); // clé → { p, voisins: [[clé, coût, longueur]] }
const segments = [];      // pour accrocher un point quelconque au réseau
const noeud = (p) => { const k = cle(p); if (!noeuds.has(k)) noeuds.set(k, { p, voisins: [] }); return k; };
for (const f of routes) {
  const p = f.properties;
  if (Number(p.position_par_rapport_au_sol) < 0 || p.nature === 'Bretelle') continue; // tunnels, bretelles
  const imp = Number(p.importance) || 6;
  // on préfère les promenades et les rues calmes aux grands boulevards
  const facteur = /Sentier|Chemin/.test(p.nature) ? 0.9 : imp <= 2 ? 1.25 : 1;
  const lignes = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
  for (const l of lignes) for (let i = 1; i < l.length; i++) {
    const a = noeud(l[i - 1]), b = noeud(l[i]), d = dist(l[i - 1], l[i]);
    noeuds.get(a).voisins.push([b, d * facteur, d]);
    noeuds.get(b).voisins.push([a, d * facteur, d]);
    segments.push([a, b]);
  }
}

// point le plus proche sur le réseau : nœud temporaire relié aux deux bouts du segment
let nTemp = 0;
function accrocher(p) {
  let best = null;
  for (const [a, b] of segments) {
    const A = noeuds.get(a).p, B = noeuds.get(b).p;
    const ax = (B[0] - A[0]) * MX, ay = (B[1] - A[1]) * MY, px = (p[0] - A[0]) * MX, py = (p[1] - A[1]) * MY;
    const t = Math.max(0, Math.min(1, (px * ax + py * ay) / (ax * ax + ay * ay || 1)));
    const d = Math.hypot(px - t * ax, py - t * ay);
    if (!best || d < best.d) best = { d, a, b, t, q: [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])] };
  }
  const k = `tmp${nTemp++}`, A = noeuds.get(best.a), B = noeuds.get(best.b);
  const da = dist(best.q, A.p), db = dist(best.q, B.p);
  noeuds.set(k, { p: best.q, voisins: [[best.a, da, da], [best.b, db, db]] });
  A.voisins.push([k, da, da]); B.voisins.push([k, db, db]);
  return k;
}

// Dijkstra avec un tas binaire
function chemin(depart, arrivee) {
  const cout = new Map([[depart, 0]]), prec = new Map(), tas = [[0, depart]];
  const pousser = (e) => { tas.push(e); let i = tas.length - 1; while (i) { const j = (i - 1) >> 1; if (tas[j][0] <= tas[i][0]) break; [tas[i], tas[j]] = [tas[j], tas[i]]; i = j; } };
  const tirer = () => {
    const top = tas[0], fin = tas.pop();
    if (tas.length) { tas[0] = fin; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < tas.length && tas[l][0] < tas[m][0]) m = l; if (r < tas.length && tas[r][0] < tas[m][0]) m = r; if (m === i) break; [tas[i], tas[m]] = [tas[m], tas[i]]; i = m; } }
    return top;
  };
  while (tas.length) {
    const [c, k] = tirer();
    if (k === arrivee) break;
    if (c > cout.get(k)) continue;
    for (const [v, w] of noeuds.get(k).voisins) {
      const nc = c + w;
      if (nc < (cout.get(v) ?? Infinity)) { cout.set(v, nc); prec.set(v, k); pousser([nc, v]); }
    }
  }
  if (!prec.has(arrivee)) throw new Error(`pas de chemin ${depart} → ${arrivee}`);
  const ks = [arrivee];
  while (ks[0] !== depart) ks.unshift(prec.get(ks[0]));
  const pts = ks.map((k) => noeuds.get(k).p);
  let longueur = 0;
  for (let i = 1; i < pts.length; i++) longueur += dist(pts[i - 1], pts[i]);
  return { pts, longueur };
}

// ---------- calcul ----------
const parId = Object.fromEntries(MONUMENTS.map((m) => [m.id, m]));
// point de départ de la visite quand le repère du monument n'est pas sur une rue (milieu du pont)
const ACCES = { pontdepierre: [-0.565, 44.8371] }; // tête du pont, rive gauche
const lonlat = (m) => ACCES[m.id] || [m.at[1], m.at[0]];
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const minutes = (m) => Math.max(1, Math.round(m / VITESSE));
const ancres = new Map(); // un seul point d'accroche par lieu
const ancre = (id, p) => { if (!ancres.has(id)) ancres.set(id, accrocher(p)); return ancres.get(id); };
const kHotel = ancre('hotel', HOTEL);

const sortie = [];
for (const pr of PROMENADES) {
  const lieux = [['hotel', HOTEL], ...pr.etapes.map((id) => [id, lonlat(parId[id])])];
  if (pr.boucle) lieux.push(['hotel', HOTEL]);
  const trace = [], etapes = [];
  let total = 0;
  for (let i = 1; i < lieux.length; i++) {
    const { pts, longueur } = chemin(ancre(...lieux[i - 1]), ancre(...lieux[i]));
    total += longueur;
    trace.push(...(trace.length ? pts.slice(1) : pts));
    etapes.push({ m: lieux[i][0], depuis: Math.round(longueur), min: minutes(longueur), km: Math.round(total) });
  }
  const propre = [];
  for (const p of trace) { const q = [r5(p[0]), r5(p[1])]; const d = propre[propre.length - 1]; if (!d || d[0] !== q[0] || d[1] !== q[1]) propre.push(q); }
  const marche = Math.round(total / VITESSE);
  sortie.push({ ...pr, distance: Math.round(total), marche, etapes, trace: propre });
  console.log(`✓ ${pr.nom.padEnd(28)} ${(total / 1000).toFixed(1)} km · ${marche} min de marche · ${propre.length} points`);
  for (const e of etapes) console.log(`    → ${e.m.padEnd(13)} ${String(e.depuis).padStart(5)} m  ${e.min} min`);
}

// temps de marche hôtel → chaque monument (aller simple)
const depuisHotel = {};
for (const m of MONUMENTS) {
  if (m.hidePin) continue;
  const { longueur } = chemin(kHotel, ancre(m.id, lonlat(m)));
  depuisHotel[m.id] = { m: Math.round(longueur), min: minutes(longueur) };
}
console.log('  depuis l’hôtel :', Object.entries(depuisHotel).map(([k, v]) => `${k} ${v.min}′`).join(', '));

const fichier = path.join(ROOT, 'data', 'promenades.json');
await writeFile(fichier, JSON.stringify({ vitesse: VITESSE, promenades: sortie, depuisHotel }));
console.log(`✓ data/promenades.json  ${((await readFile(fichier)).length / 1000).toFixed(0)} Ko`);
