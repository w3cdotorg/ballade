import type { LngLat } from './geometry';
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
