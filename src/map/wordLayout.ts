import { buildRouteGeometry, pointAt, type LngLat, type RouteGeometry } from '../route/geometry';
import type { LyricSegment } from '../sync/timeline';

export interface WordFeature {
  /** Id global séquentiel — sert de clé feature-state. */
  id: number;
  word: string;
  lngLat: LngLat;
  /** Rotation du texte en degrés (sens horaire), alignée sur le chemin, jamais tête en bas. */
  rotate: number;
  /** Temps de la ligne parente (secondes) — pilotent l'état passé/courant/futur. */
  start: number;
  end: number;
}

/** Cap géographique (degrés depuis le nord, sens horaire) du segment contenant `dist`. */
function bearingAt(route: RouteGeometry, dist: number): number {
  const { coords, cumulative, total } = route;
  if (coords.length < 2) return 0;
  const d = Math.min(Math.max(dist, 0), total);
  let i = cumulative.findIndex((c) => c >= d);
  if (i <= 0) i = 1;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lng1, lat1] = coords[i - 1];
  const [lng2, lat2] = coords[i];
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Éclate chaque ligne de paroles en mots répartis uniformément le long de son tronçon.
 * Le rendu par points garantit l'affichage de chaque mot (aucune contrainte
 * d'ajustement du label entier dans le tronçon, cause racine du bug de visibilité).
 */
export function layoutWords(segments: LyricSegment[]): WordFeature[] {
  const out: WordFeature[] = [];
  let id = 0;
  for (const seg of segments) {
    const words = seg.text.split(/\s+/).filter((w) => w !== '');
    if (words.length === 0) continue;
    const slice = buildRouteGeometry(seg.coords);
    for (let i = 0; i < words.length; i++) {
      const d = ((i + 0.5) / words.length) * slice.total;
      // Texte non tourné = lu vers l'est (cap 90°) → rotation = cap − 90.
      let rotate = (((bearingAt(slice, d) - 90) % 360) + 360) % 360;
      if (rotate > 90 && rotate < 270) rotate = (rotate + 180) % 360;
      out.push({
        id: id++,
        word: words[i],
        lngLat: pointAt(slice, d),
        rotate,
        start: seg.start,
        end: seg.end,
      });
    }
  }
  return out;
}
