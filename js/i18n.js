// Langues : comme « Bordeaux à la carte », menu 🌐 et langue du téléphone détectée au premier lancement.
// Le français est la langue source : textes de l'interface ici, contenus (fiches, photos, promenades)
// dans data/*.json. Les autres langues sont dans js/lang/<code>.js, chargées seulement si on les choisit :
//   export default { ui: {clé: texte}, epoques: {k: libellé}, monuments: {id: {name, dates, apercu, texte}},
//                    photos: {id: [légendes dans l'ordre de data/photos.json]}, promenades: {id: {nom, intro, fin}} }

export const LANGS = [
  { code: 'fr', name: 'Français', flag: '🇫🇷', locale: 'fr-FR' },
  { code: 'en', name: 'English', flag: '🇬🇧', locale: 'en-GB' },
  { code: 'es', name: 'Español', flag: '🇪🇸', locale: 'es-ES' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹', locale: 'it-IT' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', locale: 'de-DE' },
];

const FR = {
  'doc.titre': 'Bordeaux, Port de la Lune',
  'carte.aria': 'Carte 3D du centre historique de Bordeaux',
  'titre.kicker': "Bordeaux · Patrimoine mondial de l'UNESCO",
  'titre.sous': 'Les monuments historiques du centre, en relief',
  'legende.aria': 'Époques',
  'legende.aide': "Touchez une époque pour l'isoler.",
  'legende.protege': 'Autre bâtiment protégé',
  'langue.titre': 'Changer de langue',
  'btn.promenades': "Promenades à pied depuis l'hôtel",
  'liste.titre': 'Les monuments',
  'liste.aria': 'Liste des monuments',
  'liste.masquer': 'Masquer la liste',
  'liste.afficher': 'Afficher la liste',
  'outils.aria': 'Vue',
  'outils.tour': 'Faire tourner la vue',
  'outils.3d': 'Basculer vue 2D / 3D',
  'outils.accueil': "Revenir à la vue d'ensemble",
  'credits': 'Bâtiments © IGN BD TOPO · Monuments et arbres © contributeurs OpenStreetMap · Prototype',
  'hotel': 'Votre hôtel',

  'mh.titre': 'Monument historique',
  'mh.texte': 'Bâtiment protégé au titre des monuments historiques.',
  'mh.notice': 'Notice officielle {ref}',

  'apercu.plus': 'Cliquez pour en savoir plus',
  'fiche.fermer': 'Fermer la fiche',
  'fiche.autrefois': 'Autrefois',
  'fiche.aujourdhui': "Aujourd'hui",
  'fiche.chantier': 'Le chantier',
  'fiche.regarder': 'À regarder',
  'fiche.savez': 'Le saviez-vous ?',
  'fiche.visite': 'Visite',
  'fiche.siteOfficiel': 'Site officiel',
  'fiche.sources': 'Sources',
  'photo.inconnu': 'Auteur inconnu',
  'fiche.periodes': 'Époque de la photo',
  'fiche.agrandir': 'Voir la photo en grand',
  'fiche.photo': 'Photo {n} : {legende}',
  'fiche.marche': "À <b>{duree}</b> à pied de l'hôtel · {km}",
  'fiche.promenade': 'Promenade « {nom} » →',
  'visionneuse.aria': 'Photo en grand',
  'fermer': 'Fermer',

  'geo.bouton': "Me localiser",
  'geo.ici': "Vous êtes ici",
  'geo.proche': "Le plus proche",
  'geo.temps': "environ {duree} à pied · {m}",
  'geo.ouvrir': "Voir la fiche",
  'geo.loin': "Vous êtes hors du centre de Bordeaux : la carte ne vous suit pas.",
  'geo.refus': "Localisation refusée. Vous pouvez l’autoriser dans les réglages du navigateur.",
  'geo.indispo': "Localisation indisponible pour le moment.",
  'pr.aria': "Promenades à pied depuis l'hôtel",
  'pr.fermer': 'Fermer les promenades',
  'pr.kicker': 'Depuis votre hôtel',
  'pr.titre': 'Promenades à pied',
  'pr.sous': 'Trois parcours pour découvrir le centre historique, sur les rues réelles. Temps de marche sans les visites.',
  'pr.boucle': 'Boucle',
  'pr.aller': 'Aller simple',
  'pr.boucleDepuis': "Boucle depuis l'hôtel",
  'pr.allerDepuis': "Aller simple depuis l'hôtel",
  'pr.etapes': '{n} étapes',
  'pr.retourListe': '← Toutes les promenades',
  'pr.aPied': 'à pied',
  'pr.deMarche': 'de marche',
  'pr.etapesCourt': 'étapes',
  'pr.depart': 'Départ',
  'pr.retourHotel': "Retour à l'hôtel",
};

const CLE = 'pl.lang';
const CODES = LANGS.map((l) => l.code);
const charges = { fr: { ui: FR } };

let lang = (() => {
  try { const s = localStorage.getItem(CLE); if (CODES.includes(s)) return s; } catch { /* stockage indisponible */ }
  // langue du téléphone ou de l'ordinateur, sinon anglais
  for (const l of navigator.languages || [navigator.language || 'fr']) {
    const c = String(l).toLowerCase().slice(0, 2);
    if (CODES.includes(c)) return c;
  }
  return 'en';
})();

export const getLang = () => lang;
export const getLocale = () => LANGS.find((l) => l.code === lang).locale;

// charge le fichier d'une langue (une seule fois) puis l'active
export async function setLang(l) {
  if (!CODES.includes(l)) l = 'fr';
  if (!charges[l]) {
    try { charges[l] = (await import(`./lang/${l}.js?v=30`)).default; } catch { l = 'fr'; }
  }
  lang = l;
  try { localStorage.setItem(CLE, l); } catch { /* stockage indisponible */ }
  document.documentElement.lang = l;
}

const pack = () => charges[lang] || charges.fr;

export function t(key, vars) {
  let s = pack().ui?.[key] ?? FR[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? '');
  return s;
}

// contenus : traduction si elle existe, sinon le texte français d'origine
export const tEpoque = (k, fr) => pack().epoques?.[k] ?? fr;
export const tMonument = (m, champ) => pack().monuments?.[m.id]?.[champ] ?? m[champ];
export const tPhoto = (id, i, fr) => pack().photos?.[id]?.[i] ?? fr;
export const tPromenade = (p, champ) => pack().promenades?.[p.id]?.[champ] ?? p[champ];

// éléments fixes de la page : data-i18n (texte), data-i18n-title, data-i18n-aria
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  document.title = t('doc.titre');
}

export function fmtKm(m) {
  return (m / 1000).toLocaleString(getLocale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' km';
}
export function fmtDuree(min) {
  if (min < 60) return `${min} min`;
  const r = Math.round(min / 5) * 5;
  return `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, '0')}`;
}
