// Format compact des données de la carte (décodé par js/compact.js).
// Le GeoJSON écrit chaque coordonnée en entier (« -0.548767, ») : c'est l'essentiel du poids.
// Ici les coordonnées deviennent des entiers (× s) codés par écart avec le point précédent,
// d'un objet à l'autre, et le point de fermeture des anneaux est omis. Même précision, ~4× plus léger.
//
//   { s, k: [clés], f: [[géométrie, valeur1, valeur2…], …] }
//   géométrie : [[anneau], …] = Polygon, [x, y, x, y…] = LineString
//   valeurs : dans l'ordre de k ; null = propriété absente (les null finaux sont omis)
//
//   points seuls : { s, p: [x, y, x, y…] }

function codeur(s) {
  let px = 0, py = 0;
  return (pts, ferme) => {
    const out = [];
    for (let i = 0, n = ferme ? pts.length - 1 : pts.length; i < n; i++) {
      const x = Math.round(pts[i][0] * s), y = Math.round(pts[i][1] * s);
      out.push(x - px, y - py);
      px = x; py = y;
    }
    return out;
  };
}

export function compacter(features, k, s) {
  const code = codeur(s);
  const f = features.map(({ geometry: g, properties: p }) => {
    const geom = g.type === 'Polygon' ? g.coordinates.map((r) => code(r, true))
      : g.type === 'LineString' ? code(g.coordinates, false)
      : null;
    if (!geom) throw new Error('géométrie non gérée : ' + g.type);
    const row = [geom, ...k.map((c) => p[c] ?? null)];
    while (row.length > 1 && row[row.length - 1] == null) row.pop();
    return row;
  });
  return { s, k, f };
}

export const compacterPoints = (pts, s) => ({ s, p: codeur(s)(pts, false) });
