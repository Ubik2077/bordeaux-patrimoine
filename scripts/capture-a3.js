// Capture de la carte pour l'affiche A3 (affiche-a3.html).
// 1. Lancer le site en local, ouvrir http://127.0.0.1:8643/?capture dans une fenêtre dont la carte fait 1200 × 918 px
//    (par exemple avec l'émulation d'appareil des outils de développement).
// 2. Coller ce script dans la console : il cadre l'île entière (nord en haut), rend la carte en 3 600 × 2 754 px
//    sur le fond parchemin de l'affiche, puis télécharge carte-a3.png et carte-a3.json (positions des monuments,
//    de l'hôtel et des promenades sur l'image, en % de la largeur et de la hauteur).
// 3. Convertir carte-a3.png en img/affiche/carte-a3.jpg (qualité 88) et copier carte-a3.json dans img/affiche/.
(async () => {
  const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight;
  const zone = await (await fetch('data/zone.json')).json();
  const pts = zone.geometry.coordinates[0];

  // cadrage : l'île entière au centre, nord en haut, inclinaison 42°
  let cam = { center: [-0.5687, 44.8442], zoom: 13.5, bearing: 0, pitch: 42, padding: { top: 0, bottom: 0, left: 0, right: 0 } };
  for (let i = 0; i < 8; i++) {
    map.jumpTo(cam);
    let bb = [1e9, 1e9, -1e9, -1e9];
    for (const q of pts) { const s = map.project(q); bb = [Math.min(bb[0], s.x), Math.min(bb[1], s.y), Math.max(bb[2], s.x), Math.max(bb[3], s.y)]; }
    const c = map.unproject([(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2 + 6]); // + 6 : le socle sous l'île
    const k = Math.min((W - 30) / (bb[2] - bb[0]), (H - 40) / (bb[3] - bb[1] + 12));
    cam = { ...cam, center: [c.lng, c.lat], zoom: cam.zoom + Math.log2(k) };
  }
  map.jumpTo(cam);

  // haute définition et fond de la couleur de l'affiche
  map.setPixelRatio(3);
  map.setPaintProperty('fond', 'background-color', '#f3e8d4');
  await new Promise((r) => map.once('idle', r));
  const image = await new Promise((r) => { map.once('render', () => r(map.getCanvas().toDataURL('image/png'))); map.triggerRepaint(); });

  // positions sur l'image
  const f = (lng, lat) => { const p = map.project([lng, lat]); return [+(p.x / W * 100).toFixed(2), +(p.y / H * 100).toFixed(2)]; };
  const mo = await (await fetch('data/monuments.json')).json();
  const pr = await (await fetch('data/promenades.json')).json();
  const positions = {
    cam: { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }, ratio: W / H,
    points: Object.fromEntries(mo.monuments.map((m) => [m.id, f(m.at[1], m.at[0])])),
    hotel: f(mo.hotel.at[1], mo.hotel.at[0]),
    promenades: pr.promenades.map((p) => ({ id: p.id, trace: p.trace.filter((_, i) => i % 2 === 0 || i === p.trace.length - 1).map(([x, y]) => f(x, y)) })),
  };

  const telecharger = (nom, url) => { const a = document.createElement('a'); a.href = url; a.download = nom; a.click(); };
  telecharger('carte-a3.png', image);
  telecharger('carte-a3.json', URL.createObjectURL(new Blob([JSON.stringify(positions)], { type: 'application/json' })));
})();
