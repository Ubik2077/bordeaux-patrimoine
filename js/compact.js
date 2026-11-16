// Décode le format compact produit par scripts/compact.mjs en GeoJSON pour MapLibre.

function decodeur(s) {
  let px = 0, py = 0;
  return (a, ferme) => {
    const r = [];
    for (let i = 0; i < a.length; i += 2) { px += a[i]; py += a[i + 1]; r.push([px / s, py / s]); }
    if (ferme) r.push(r[0]);
    return r;
  };
}

export function deplier({ s, k, f }) {
  const dec = decodeur(s);
  return {
    type: 'FeatureCollection',
    features: f.map(([g, ...v]) => {
      const properties = {};
      for (let i = 0; i < v.length; i++) if (v[i] != null) properties[k[i]] = v[i];
      const geometry = Array.isArray(g[0])
        ? { type: 'Polygon', coordinates: g.map((r) => dec(r, true)) }
        : { type: 'LineString', coordinates: dec(g, false) };
      return { type: 'Feature', properties, geometry };
    }),
  };
}

// points → petits polygones réguliers (houppiers des arbres), rayon en mètres
export function polygonesAutour({ s, p }, rayon, cotes) {
  const pts = decodeur(s)(p, false);
  const mx = 111320 * Math.cos((44.84 * Math.PI) / 180), my = 110540; // m par degré à Bordeaux
  const gabarit = Array.from({ length: cotes + 1 }, (_, i) => {
    const a = ((i % cotes) * 2 * Math.PI) / cotes;
    return [(Math.cos(a) * rayon) / mx, (Math.sin(a) * rayon) / my];
  });
  return {
    type: 'FeatureCollection',
    features: pts.map(([x, y]) => ({
      type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [gabarit.map(([dx, dy]) => [x + dx, y + dy])] },
    })),
  };
}
