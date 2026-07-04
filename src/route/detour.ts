import type { LngLat } from './geometry';
import { haversine } from './geometry';
import type { Profile } from './routing';
import { tokenize } from '../lyrics/keywords';

export type PoiCategory = 'monument' | 'park' | 'water' | 'cafe';

export interface Poi {
  name?: string;
  lngLat: LngLat;
  category: PoiCategory;
}

/** Vitesses de référence par profil (m/s), pour estimer la durée du trajet. */
export const SPEED_MPS: Record<Profile, number> = { foot: 1.3, bike: 4.2, car: 11.1 };

// On ne propose un détour que si la chanson dépasse la durée estimée du trajet de 20 %.
const DETOUR_RATIO = 1.2;

/** Longueur de trajet (m) qui occuperait toute la chanson au rythme du profil. */
export function targetLength(durationSec: number, profile: Profile): number {
  return durationSec * SPEED_MPS[profile];
}

export function needsDetour(routeTotal: number, durationSec: number, profile: Profile): boolean {
  return targetLength(durationSec, profile) > routeTotal * DETOUR_RATIO;
}

// Lexique thématique FR/EN (formes normalisées, sans accents) : mots de paroles → catégorie.
const LEXICON: Record<PoiCategory, readonly string[]> = {
  monument: [
    'chateau', 'eglise', 'cathedrale', 'tour', 'pont', 'palais', 'statue',
    'monument', 'temple', 'abbaye', 'castle', 'church', 'tower', 'bridge', 'abbey',
  ],
  park: [
    'jardin', 'parc', 'fleur', 'fleurs', 'arbre', 'arbres', 'foret', 'prairie',
    'rose', 'roses', 'garden', 'park', 'flower', 'flowers', 'tree', 'trees',
    'forest', 'meadow',
  ],
  water: [
    'eau', 'mer', 'ocean', 'riviere', 'fleuve', 'lac', 'plage', 'quai', 'vague',
    'vagues', 'fontaine', 'pluie', 'sea', 'river', 'water', 'lake', 'beach',
    'wave', 'waves', 'fountain', 'shore', 'rain',
  ],
  cafe: [
    'cafe', 'bar', 'danse', 'danser', 'theatre', 'musique', 'cabaret', 'scene',
    'coffee', 'music', 'dance', 'dancing', 'stage',
  ],
};

/** Catégories de POI évoquées par les paroles. */
export function categoryHints(keywords: ReadonlySet<string>): Set<PoiCategory> {
  const hints = new Set<PoiCategory>();
  for (const [cat, words] of Object.entries(LEXICON) as [PoiCategory, readonly string[]][]) {
    if (words.some((w) => keywords.has(w))) hints.add(cat);
  }
  return hints;
}

const CATEGORY_PRIORITY: Record<PoiCategory, number> = { monument: 4, park: 3, water: 2, cafe: 1 };
const NAME_MATCH_BONUS = 100;
const HINT_BONUS = 30;

/** Score d'attrait d'un POI : nom ↔ paroles ≫ catégorie évoquée > priorité fixe. */
export function scorePoi(
  poi: Poi,
  keywords: ReadonlySet<string>,
  hints: ReadonlySet<PoiCategory>,
): number {
  let score = CATEGORY_PRIORITY[poi.category];
  if (hints.has(poi.category)) score += HINT_BONUS;
  if (poi.name) {
    const matches = new Set(tokenize(poi.name).filter((w) => keywords.has(w)));
    score += NAME_MATCH_BONUS * matches.size;
  }
  return score;
}

export interface Bbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

const METERS_PER_DEG_LAT = 110540;
const METERS_PER_DEG_LNG_EQUATOR = 111320;

/** Bbox du trajet élargie de `marginMeters` de chaque côté. */
export function corridorBbox(coords: LngLat[], marginMeters: number): Bbox {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of coords) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const midLat = (south + north) / 2;
  const dLat = marginMeters / METERS_PER_DEG_LAT;
  const dLng = marginMeters / (METERS_PER_DEG_LNG_EQUATOR * Math.cos((midLat * Math.PI) / 180));
  return { south: south - dLat, west: west - dLng, north: north + dLat, east: east + dLng };
}

/**
 * Marge de recherche autour du trajet : un POI à d mètres du corridor rallonge
 * d'environ 2d, donc la moitié de la rallonge voulue suffit. Bornée pour garder
 * des requêtes Overpass raisonnables.
 */
export function detourMargin(extraMeters: number): number {
  return Math.min(Math.max(extraMeters / 2, 300), 10000);
}

export interface SelectContext {
  start: LngLat;
  end: LngLat;
  /** Longueur réelle (OSRM) du trajet direct, en mètres. */
  directLength: number;
  /** Longueur de trajet visée, en mètres. */
  target: number;
  keywords: Set<string>;
  hints: Set<PoiCategory>;
}

export interface DetourSelection {
  /** POI retenus, ordonnés le long de l'axe départ → arrivée. */
  waypoints: Poi[];
  /** Longueur estimée du trajet avec détour, en mètres. */
  estimatedLength: number;
}

const MAX_POIS = 3;
const TARGET_MIN = 0.9;
const TARGET_MAX = 1.1;
// À score d'attrait égal, on préfère le candidat qui rapproche le plus de la cible.
const FIT_BONUS_PER_KM = 5;

// Projection locale équirectangulaire (m), suffisante à l'échelle d'un trajet.
function localXY(p: LngLat, origin: LngLat): [number, number] {
  const kx = METERS_PER_DEG_LNG_EQUATOR * Math.cos((origin[1] * Math.PI) / 180);
  return [(p[0] - origin[0]) * kx, (p[1] - origin[1]) * METERS_PER_DEG_LAT];
}

// Abscisse (0 = départ, 1 = arrivée) de la projection du point sur l'axe du trajet.
function axisT(p: LngLat, start: LngLat, end: LngLat): number {
  const [ex, ey] = localXY(end, start);
  const [px, py] = localXY(p, start);
  const d2 = ex * ex + ey * ey;
  return d2 === 0 ? 0 : (px * ex + py * ey) / d2;
}

/**
 * Sélection gloutonne : à chaque tour, le POI le mieux noté dont l'insertion ne
 * dépasse pas 110 % de la cible, jusqu'à atteindre 90 % de la cible ou 3 POI.
 * La rallonge est estimée à vol d'oiseau (haversine) et appliquée à la longueur
 * réelle du trajet direct ; le trajet OSRM final fera foi.
 */
export function selectWaypoints(pois: Poi[], ctx: SelectContext): DetourSelection {
  const { start, end, directLength, target, keywords, hints } = ctx;
  const byAxis = (a: Poi, b: Poi) => axisT(a.lngLat, start, end) - axisT(b.lngLat, start, end);
  const chain = (wps: Poi[]): number => {
    const pts = [start, ...wps.map((w) => w.lngLat), end];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += haversine(pts[i - 1], pts[i]);
    return len;
  };
  const directHaversine = haversine(start, end);
  const estimate = (wps: Poi[]) => directLength + (chain(wps) - directHaversine);

  const selected: Poi[] = [];
  const remaining = [...pois];
  let curLen = directLength;
  while (selected.length < MAX_POIS && curLen < TARGET_MIN * target) {
    let best: { poi: Poi; len: number; score: number } | undefined;
    for (const poi of remaining) {
      const len = estimate([...selected, poi].sort(byAxis));
      if (len > TARGET_MAX * target) continue;
      const score =
        scorePoi(poi, keywords, hints) + ((len - curLen) / 1000) * FIT_BONUS_PER_KM;
      if (!best || score > best.score) best = { poi, len, score };
    }
    if (!best) break;
    selected.push(best.poi);
    remaining.splice(remaining.indexOf(best.poi), 1);
    curLen = best.len;
  }
  return { waypoints: selected.sort(byAxis), estimatedLength: curLen };
}
