# POI Detour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the song is longer than the route, offer a one-click scenic detour through POIs (matched to the lyrics) that lengthens the route to fit the song.

**Architecture:** Pure selection logic in `src/route/detour.ts` (scoring + greedy waypoint selection with haversine estimates), one Overpass API client (`src/route/overpass.ts`), keyword extraction from lyrics (`src/lyrics/keywords.ts`), `fetchRoute` generalized to N waypoints, and UI wiring in `main.ts` (auto-offer button → auto-apply best POIs → removable).

**Tech Stack:** TypeScript, Vite, Vitest (network mocked with `vi.stubGlobal('fetch', …)`), MapLibre GL, Overpass API, OSRM (FOSSGIS public servers).

**Spec:** `docs/superpowers/specs/2026-07-04-poi-detour-design.md`

## Global Constraints

- Run `export PATH="/opt/homebrew/bin:$PATH"` before any npm/npx command.
- No ESLint configured in this project. Verification = `npm test` + `npm run typecheck` (both must pass before any commit).
- Comments in code follow the project's style: French, only where the code can't speak for itself.
- User-facing strings (statuses, button labels) are in English, sentence case, like the existing UI.
- Commit messages: conventional prefixes (`feat:`, `test:`, `refactor:`, `docs:`), ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- One deliberate deviation from the spec (amended in Task 4): instead of a *penalty* proportional to detour cost, the greedy selection uses a *bonus* for closing the gap to the target length (the overshoot cap already bounds absurd detours, and we *want* added length).

---

### Task 1: Export `haversine` from geometry

**Files:**
- Modify: `src/route/geometry.ts` (function exists at line 14, currently private)
- Test: `src/route/geometry.test.ts`

**Interfaces:**
- Produces: `export function haversine(a: LngLat, b: LngLat): number` — great-circle distance in meters. Task 4 (`detour.ts`) imports it.

- [ ] **Step 1: Write the failing test** — append to `src/route/geometry.test.ts`:

```ts
describe('haversine', () => {
  it('mesure ~111,2 km pour 1° de latitude', () => {
    expect(haversine([0, 0], [0, 1])).toBeCloseTo(111195, -2);
  });

  it('vaut 0 pour deux points identiques', () => {
    expect(haversine([2.35, 48.85], [2.35, 48.85])).toBe(0);
  });
});
```

Add `haversine` to the existing import from `./geometry`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/route/geometry.test.ts`
Expected: FAIL — `haversine` is not exported.

- [ ] **Step 3: Minimal implementation** — in `src/route/geometry.ts`, change line 14:

```ts
/** Distance orthodromique (m) entre deux points. */
export function haversine(a: LngLat, b: LngLat): number {
```

(body unchanged)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/route/geometry.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add src/route/geometry.ts src/route/geometry.test.ts
git commit -m "refactor: export haversine for detour estimation"
```

---

### Task 2: Lyric keyword extraction (`src/lyrics/keywords.ts`)

**Files:**
- Create: `src/lyrics/keywords.ts`
- Test: `src/lyrics/keywords.test.ts`

**Interfaces:**
- Consumes: `LyricLine` from `src/lyrics/types.ts` (`{ start: number; end: number; text: string }`).
- Produces: `export function tokenize(text: string): string[]` and `export function extractKeywords(lines: readonly LyricLine[]): Set<string>`. Tokens are lowercase, accent-stripped, ≥ 3 letters, FR/EN stopwords removed. Tasks 3–4 use `tokenize` (POI names) and Task 7 uses `extractKeywords`.

- [ ] **Step 1: Write the failing test** — create `src/lyrics/keywords.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractKeywords, tokenize } from './keywords';

describe('tokenize', () => {
  it('minuscules, accents retirés, mots courts et mots-outils exclus', () => {
    expect(tokenize('Sous le pont Mirabeau coule la Seine')).toEqual([
      'pont',
      'mirabeau',
      'coule',
      'seine',
    ]);
  });

  it('retire les accents (rivière → riviere)', () => {
    expect(tokenize('La rivière')).toEqual(['riviere']);
  });

  it("coupe sur les apostrophes (d'amour → amour)", () => {
    expect(tokenize("d'amour")).toEqual(['amour']);
  });

  it('filtre les mots-outils anglais', () => {
    expect(tokenize('When the river runs')).toEqual(['river', 'runs']);
  });
});

describe('extractKeywords', () => {
  it('agrège les mots de toutes les lignes, dédupliqués', () => {
    const kw = extractKeywords([
      { start: 0, end: 2, text: 'Le jardin, le jardin' },
      { start: 2, end: 4, text: 'Et la mer' },
    ]);
    expect(kw).toEqual(new Set(['jardin', 'mer']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lyrics/keywords.test.ts`
Expected: FAIL — module `./keywords` not found.

- [ ] **Step 3: Implementation** — create `src/lyrics/keywords.ts`:

```ts
import type { LyricLine } from './types';

// Mots-outils FR/EN (formes déjà normalisées : minuscules, sans accents).
// Volontairement large sur les remplissages de paroles (yeah, baby, gonna…).
const STOPWORDS = new Set([
  // français
  'les', 'des', 'une', 'son', 'ses', 'mes', 'tes', 'nos', 'vos', 'est', 'ont',
  'pas', 'sur', 'par', 'que', 'qui', 'quoi', 'moi', 'toi', 'lui', 'eux', 'aux',
  'ces', 'dans', 'avec', 'pour', 'sans', 'sous', 'mais', 'tout', 'toute',
  'tous', 'toutes', 'elle', 'elles', 'nous', 'vous', 'ils', 'leur', 'leurs',
  'cette', 'comme', 'plus', 'moins', 'bien', 'encore', 'jamais', 'toujours',
  'quand', 'alors', 'ainsi', 'autre', 'etre', 'avoir', 'fait', 'faire', 'suis',
  'etait', 'sont', 'sera', 'peut', 'rien', 'chaque', 'depuis', 'entre', 'vers',
  'chez', 'tres', 'aussi', 'meme', 'deja', 'donc', 'puis', 'cela',
  // anglais
  'the', 'and', 'you', 'are', 'was', 'not', 'but', 'for', 'all', 'out', 'she',
  'him', 'her', 'his', 'its', 'our', 'who', 'how', 'why', 'get', 'got', 'let',
  'can', 'one', 'now', 'too', 'that', 'this', 'with', 'from', 'your', 'have',
  'will', 'when', 'what', 'they', 'them', 'then', 'than', 'were', 'been',
  'being', 'just', 'only', 'over', 'into', 'some', 'more', 'most', 'very',
  'much', 'many', 'still', 'again', 'never', 'always', 'about', 'after',
  'before', 'where', 'which', 'while', 'would', 'could', 'should', 'there',
  'their', 'these', 'those', 'here', 'dont', 'cant', 'wont', 'aint', 'yeah',
  'baby', 'gonna', 'wanna', 'gotta', 'ooh', 'whoa', 'woah', 'hey',
]);

/** Mots normalisés d'un texte : minuscules, sans accents, ≥ 3 lettres, hors mots-outils. */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/** Vocabulaire dédupliqué de toutes les lignes de paroles. */
export function extractKeywords(lines: readonly LyricLine[]): Set<string> {
  return new Set(lines.flatMap((l) => tokenize(l.text)));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lyrics/keywords.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lyrics/keywords.ts src/lyrics/keywords.test.ts
git commit -m "feat: extract normalized keywords from lyrics"
```

---

### Task 3: Detour core — types, threshold, hints, scoring (`src/route/detour.ts`)

**Files:**
- Create: `src/route/detour.ts`
- Test: `src/route/detour.test.ts`

**Interfaces:**
- Consumes: `Profile` from `./routing` (`'foot' | 'bike' | 'car'`), `tokenize` from `../lyrics/keywords`, `LngLat` from `./geometry`.
- Produces (used by Tasks 4, 5, 7):
  - `export type PoiCategory = 'monument' | 'park' | 'water' | 'cafe'`
  - `export interface Poi { name?: string; lngLat: LngLat; category: PoiCategory }`
  - `export const SPEED_MPS: Record<Profile, number>`
  - `export function targetLength(durationSec: number, profile: Profile): number`
  - `export function needsDetour(routeTotal: number, durationSec: number, profile: Profile): boolean`
  - `export function categoryHints(keywords: ReadonlySet<string>): Set<PoiCategory>`
  - `export function scorePoi(poi: Poi, keywords: ReadonlySet<string>, hints: ReadonlySet<PoiCategory>): number`

- [ ] **Step 1: Write the failing test** — create `src/route/detour.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { categoryHints, needsDetour, scorePoi, targetLength, type Poi } from './detour';

const none = new Set<string>();
const noHints = new Set<never>();

describe('targetLength / needsDetour', () => {
  it('cible = durée × vitesse du profil (à pied 1,3 m/s)', () => {
    expect(targetLength(300, 'foot')).toBeCloseTo(390);
  });

  it('détour proposé quand la chanson dépasse la durée du trajet de 20 %', () => {
    // 1000 m à pied ≈ 769 s ; seuil ×1,2 ≈ 923 s.
    expect(needsDetour(1000, 1000, 'foot')).toBe(true);
    expect(needsDetour(1000, 900, 'foot')).toBe(false);
  });

  it('tient compte du profil (en voiture le même trajet est vite avalé)', () => {
    expect(needsDetour(10000, 1000, 'car')).toBe(false);
    expect(needsDetour(10000, 1200, 'car')).toBe(true);
  });
});

describe('categoryHints', () => {
  it('mappe les mots des paroles vers les catégories de POI', () => {
    expect(categoryHints(new Set(['riviere', 'jardin', 'chateau']))).toEqual(
      new Set(['water', 'park', 'monument']),
    );
  });

  it('vide quand aucun mot ne matche', () => {
    expect(categoryHints(new Set(['voiture', 'lundi']))).toEqual(new Set());
  });
});

describe('scorePoi', () => {
  const poi = (category: Poi['category'], name?: string): Poi => ({
    category,
    name,
    lngLat: [0, 0],
  });

  it('priorité fixe : monuments > parcs > eau > cafés', () => {
    expect(scorePoi(poi('monument'), none, noHints)).toBe(4);
    expect(scorePoi(poi('park'), none, noHints)).toBe(3);
    expect(scorePoi(poi('water'), none, noHints)).toBe(2);
    expect(scorePoi(poi('cafe'), none, noHints)).toBe(1);
  });

  it('bonus de catégorie suggérée par les paroles (+30)', () => {
    expect(scorePoi(poi('water'), none, new Set(['water']))).toBe(32);
  });

  it('gros bonus par mot des paroles présent dans le nom (+100/mot, dédupliqué)', () => {
    const kw = new Set(['jardin', 'plantes']);
    expect(scorePoi(poi('park', 'Jardin des Plantes'), kw, new Set(['park']))).toBe(233);
    expect(scorePoi(poi('cafe', 'Café Jardin Jardin'), new Set(['jardin']), noHints)).toBe(101);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/route/detour.test.ts`
Expected: FAIL — module `./detour` not found.

- [ ] **Step 3: Implementation** — create `src/route/detour.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/route/detour.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/route/detour.ts src/route/detour.test.ts
git commit -m "feat: detour threshold, lyric category hints and POI scoring"
```

---

### Task 4: Greedy waypoint selection + corridor bbox (`src/route/detour.ts`)

**Files:**
- Modify: `src/route/detour.ts` (created in Task 3)
- Test: `src/route/detour.test.ts` (append)
- Modify: `docs/superpowers/specs/2026-07-04-poi-detour-design.md` (scoring wording)

**Interfaces:**
- Consumes: `haversine` from `./geometry` (Task 1), `Poi`/`PoiCategory`/`scorePoi` (Task 3).
- Produces (used by Task 7):
  - `export interface Bbox { south: number; west: number; north: number; east: number }`
  - `export function corridorBbox(coords: LngLat[], marginMeters: number): Bbox`
  - `export function detourMargin(extraMeters: number): number`
  - `export interface SelectContext { start: LngLat; end: LngLat; directLength: number; target: number; keywords: Set<string>; hints: Set<PoiCategory> }`
  - `export interface DetourSelection { waypoints: Poi[]; estimatedLength: number }`
  - `export function selectWaypoints(pois: Poi[], ctx: SelectContext): DetourSelection`

- [ ] **Step 1: Write the failing tests** — append to `src/route/detour.test.ts` (extend the import from `./detour` with `corridorBbox, detourMargin, selectWaypoints`):

```ts
describe('corridorBbox / detourMargin', () => {
  it('englobe le trajet avec une marge en mètres convertie en degrés', () => {
    const b = corridorBbox([[2.3, 48.8], [2.4, 48.9]], 1000);
    expect(b.south).toBeCloseTo(48.791, 3);
    expect(b.north).toBeCloseTo(48.909, 3);
    expect(b.west).toBeCloseTo(2.286, 3);
    expect(b.east).toBeCloseTo(2.414, 3);
  });

  it('marge = moitié de la rallonge, bornée à [300 m, 10 km]', () => {
    expect(detourMargin(400)).toBe(300);
    expect(detourMargin(4000)).toBe(2000);
    expect(detourMargin(50000)).toBe(10000);
  });
});

describe('selectWaypoints', () => {
  // Trajet direct ~2224 m plein est sur l'équateur ; les POI sont décalés au nord.
  const start: [number, number] = [0, 0];
  const end: [number, number] = [0.02, 0];
  const direct = 2224;
  const poi = (lngLat: [number, number], category: Poi['category'], name?: string): Poi => ({
    lngLat,
    category,
    name,
  });
  const ctx = (target: number) => ({
    start,
    end,
    directLength: direct,
    target,
    keywords: new Set<string>(),
    hints: new Set<Poi['category']>(),
  });

  it('choisit le POI au meilleur score à géométrie égale', () => {
    // Deux POI symétriques (même rallonge ~624 m) : le monument (4) bat le café (1).
    const monument = poi([0.01, 0.008], 'monument');
    const cafe = poi([0.01, -0.008], 'cafe');
    const sel = selectWaypoints([cafe, monument], ctx(3100));
    expect(sel.waypoints).toEqual([monument]);
    expect(sel.estimatedLength).toBeGreaterThan(2790); // ≥ 90 % de la cible
    expect(sel.estimatedLength).toBeLessThan(3410); // ≤ 110 % de la cible
  });

  it('écarte les candidats qui feraient dépasser 110 % de la cible', () => {
    const tooFar = poi([0.01, 0.05], 'monument'); // rallonge ~9 km
    const sel = selectWaypoints([tooFar], ctx(2500));
    expect(sel.waypoints).toEqual([]);
    expect(sel.estimatedLength).toBe(direct);
  });

  it('enchaîne plusieurs POI, plafonnés à 3', () => {
    const pois = [
      poi([0.004, 0.01], 'monument'),
      poi([0.008, 0.01], 'monument'),
      poi([0.012, 0.01], 'monument'),
      poi([0.016, 0.01], 'monument'),
    ];
    const sel = selectWaypoints(pois, ctx(20000));
    expect(sel.waypoints).toHaveLength(3);
  });

  it('ordonne les waypoints le long de l’axe départ → arrivée', () => {
    const late = poi([0.015, 0.006], 'park');
    const early = poi([0.005, 0.006], 'park');
    const sel = selectWaypoints([late, early], ctx(5000));
    expect(sel.waypoints.map((w) => w.lngLat[0])).toEqual([0.005, 0.015]);
  });

  it('estime la longueur à partir de la longueur réelle du trajet direct', () => {
    // directLength (réel OSRM) > haversine : seule la rallonge est estimée à vol d'oiseau.
    const monument = poi([0.01, 0.008], 'monument');
    const sel = selectWaypoints([monument], {
      start,
      end,
      directLength: 3000,
      target: 3900,
      keywords: new Set<string>(),
      hints: new Set<Poi['category']>(),
    });
    expect(sel.waypoints).toEqual([monument]);
    expect(sel.estimatedLength).toBeCloseTo(3624, -2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/route/detour.test.ts`
Expected: FAIL — `corridorBbox`, `detourMargin`, `selectWaypoints` not exported.

- [ ] **Step 3: Implementation** — append to `src/route/detour.ts` (add `import { haversine } from './geometry';` — merge with the existing type import):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/route/detour.test.ts`
Expected: PASS.

- [ ] **Step 5: Amend the spec** — in `docs/superpowers/specs/2026-07-04-poi-detour-design.md`, replace the line:

```
4. Minus a penalty proportional to the estimated detour cost.
```

with:

```
4. Plus a small bonus proportional to how much the candidate closes the gap to
   the target length (the ≤110 % overshoot cap already bounds absurd detours;
   added length is the goal, not a cost).
```

- [ ] **Step 6: Full verification and commit**

Run: `npm test` and `npm run typecheck`
Expected: all tests pass, no type errors.

```bash
git add src/route/detour.ts src/route/detour.test.ts docs/superpowers/specs/2026-07-04-poi-detour-design.md
git commit -m "feat: greedy waypoint selection within a route corridor"
```

---

### Task 5: Overpass POI client (`src/route/overpass.ts`)

**Files:**
- Create: `src/route/overpass.ts`
- Test: `src/route/overpass.test.ts`

**Interfaces:**
- Consumes: `Bbox`, `Poi`, `PoiCategory` from `./detour` (Tasks 3–4).
- Produces (used by Task 7): `export async function fetchPois(bbox: Bbox): Promise<Poi[]>` — throws `Error('Overpass: HTTP <status>')` on non-2xx. Also `export function buildPoiQuery(b: Bbox): string` (exported for tests).

- [ ] **Step 1: Write the failing test** — create `src/route/overpass.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPoiQuery, fetchPois } from './overpass';

afterEach(() => vi.unstubAllGlobals());

const bbox = { south: 48.79, west: 2.28, north: 48.91, east: 2.42 };

describe('buildPoiQuery', () => {
  it('couvre les 4 catégories sur la bbox, avec out center', () => {
    const q = buildPoiQuery(bbox);
    expect(q).toContain('[out:json]');
    expect(q).toContain('(48.79,2.28,48.91,2.42)');
    expect(q).toContain('tourism');
    expect(q).toContain('historic');
    expect(q).toContain('leisure');
    expect(q).toContain('natural');
    expect(q).toContain('amenity');
    expect(q).toContain('out center');
  });
});

describe('fetchPois', () => {
  it('interroge Overpass en POST et convertit nodes et ways (center) en POI', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          { type: 'node', lat: 48.86, lon: 2.34, tags: { tourism: 'viewpoint', name: 'Belvédère' } },
          { type: 'way', center: { lat: 48.85, lon: 2.36 }, tags: { leisure: 'park', name: 'Square' } },
          { type: 'node', lat: 48.84, lon: 2.35, tags: { natural: 'water' } },
          { type: 'node', lat: 48.83, lon: 2.33, tags: { amenity: 'cafe', name: 'Chez Prune' } },
          { type: 'node', lat: 48.82, lon: 2.32 }, // sans tags → ignoré
          { type: 'node', lat: 48.81, lon: 2.31, tags: { amenity: 'bank' } }, // hors catégories → ignoré
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const pois = await fetchPois(bbox);
    expect(String(fetchMock.mock.calls[0][0])).toContain('overpass-api.de/api/interpreter');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(pois).toEqual([
      { name: 'Belvédère', lngLat: [2.34, 48.86], category: 'monument' },
      { name: 'Square', lngLat: [2.36, 48.85], category: 'park' },
      { name: undefined, lngLat: [2.35, 48.84], category: 'water' },
      { name: 'Chez Prune', lngLat: [2.33, 48.83], category: 'cafe' },
    ]);
  });

  it('jette une erreur claire sur statut HTTP non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 504 }));
    await expect(fetchPois(bbox)).rejects.toThrow('Overpass: HTTP 504');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/route/overpass.test.ts`
Expected: FAIL — module `./overpass` not found.

- [ ] **Step 3: Implementation** — create `src/route/overpass.ts`:

```ts
import type { Bbox, Poi, PoiCategory } from './detour';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Requête Overpass QL : les 4 familles de POI du détour, limitées à 80 éléments. */
export function buildPoiQuery(b: Bbox): string {
  const bb = `(${b.south},${b.west},${b.north},${b.east})`;
  const selectors = [
    'nwr["tourism"~"^(attraction|viewpoint|artwork)$"]',
    'nwr["historic"]',
    'nwr["leisure"~"^(park|garden)$"]',
    'nwr["natural"="water"]',
    'nwr["amenity"~"^(cafe|theatre|arts_centre)$"]',
  ];
  return `[out:json][timeout:25];(${selectors.map((s) => s + bb + ';').join('')});out center 80;`;
}

// L'ordre reflète la priorité en cas de tags multiples (un parc historique = monument).
function categorize(tags: Record<string, string>): PoiCategory | undefined {
  if (/^(attraction|viewpoint|artwork)$/.test(tags.tourism ?? '') || tags.historic) return 'monument';
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park';
  if (tags.natural === 'water') return 'water';
  if (/^(cafe|theatre|arts_centre)$/.test(tags.amenity ?? '')) return 'cafe';
  return undefined;
}

/** POI des 4 catégories dans la bbox (nodes directs, ways/relations via `out center`). */
export async function fetchPois(bbox: Bbox): Promise<Poi[]> {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(buildPoiQuery(bbox))}`,
  });
  if (!res.ok) throw new Error(`Overpass: HTTP ${res.status}`);
  const data = (await res.json()) as { elements?: OverpassElement[] };
  const pois: Poi[] = [];
  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat === undefined || lon === undefined || !el.tags) continue;
    const category = categorize(el.tags);
    if (!category) continue;
    pois.push({ name: el.tags.name, lngLat: [lon, lat], category });
  }
  return pois;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/route/overpass.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/route/overpass.ts src/route/overpass.test.ts
git commit -m "feat: fetch detour POI candidates from Overpass"
```

---

### Task 6: Multi-waypoint `fetchRoute`

**Files:**
- Modify: `src/route/routing.ts:11-19`
- Modify: `src/main.ts:88` (single call site)
- Test: `src/route/routing.test.ts`

**Interfaces:**
- Produces: `export async function fetchRoute(points: LngLat[], profile: Profile): Promise<LngLat[]>` — signature change from `(start, end, profile)`. Task 7 calls it with `[start, ...waypoints, end]`.

- [ ] **Step 1: Update the tests** — in `src/route/routing.test.ts`, update the two passing-coordinates calls and add a waypoint test:

Line 16: `const coords = await fetchRoute([[2.3, 48.8], [2.4, 48.9]], 'foot');`
Line 29: `await expect(fetchRoute([[0, 0], [1, 1]], 'car')).rejects.toThrow('No route found');`
Line 34: `await expect(fetchRoute([[0, 0], [1, 1]], 'bike')).rejects.toThrow('Routing: HTTP 429');`

Append inside `describe('fetchRoute', …)`:

```ts
  it('enchaîne les waypoints intermédiaires dans l’URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ geometry: { coordinates: [[0, 0]] } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await fetchRoute([[2.3, 48.8], [2.35, 48.85], [2.4, 48.9]], 'foot');
    expect(String(fetchMock.mock.calls[0][0])).toContain('2.3,48.8;2.35,48.85;2.4,48.9');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/route/routing.test.ts`
Expected: FAIL — signature mismatch (arrays end up serialized wrong in the URL).

- [ ] **Step 3: Implementation** — in `src/route/routing.ts`, replace `fetchRoute` (lines 10–19):

```ts
/** Itinéraire via les serveurs OSRM publics FOSSGIS ; `points` = départ, waypoints, arrivée. */
export async function fetchRoute(points: LngLat[], profile: Profile): Promise<LngLat[]> {
  const pairs = points.map((p) => `${p[0]},${p[1]}`).join(';');
  const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${pairs}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing: HTTP ${res.status}`);
  const data = (await res.json()) as OsrmResponse;
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found');
  return data.routes[0].geometry.coordinates;
}
```

In `src/main.ts` line 88, change:

```ts
    const coords = await fetchRoute([state.start, state.end], c.profile.value as Profile);
```

- [ ] **Step 4: Full verification**

Run: `npm test` and `npm run typecheck`
Expected: all tests pass, no type errors (typecheck catches any missed call site).

- [ ] **Step 5: Commit**

```bash
git add src/route/routing.ts src/route/routing.test.ts src/main.ts
git commit -m "refactor: fetchRoute accepts intermediate waypoints"
```

---

### Task 7: UI wiring — offer, apply, remove

**Files:**
- Modify: `index.html` (detour button in section 3)
- Modify: `src/ui/controls.ts` (new control)
- Modify: `src/main.ts` (state, handlers, hooks into computeRoute/loadAudioFile/reset)
- Modify: `TODO.md` (tick the feature)

**Interfaces:**
- Consumes: `fetchPois` (Task 5); `categoryHints`, `corridorBbox`, `detourMargin`, `needsDetour`, `selectWaypoints`, `targetLength`, `Poi` (Tasks 3–4); `extractKeywords` (Task 2); multi-point `fetchRoute` (Task 6).
- Produces: user-facing feature. No downstream consumers.

No unit test carries this task (DOM wiring; the logic underneath is covered by Tasks 1–6). Verification is typecheck + full suite + a dev-server smoke test.

- [ ] **Step 1: Add the button** — in `index.html`, section «3. Play», insert before the play button (line 42):

```html
        <button id="detour" hidden>✨ Add a detour</button>
```

- [ ] **Step 2: Register the control** — in `src/ui/controls.ts`, add to the `Controls` interface after `lyricsOffset`:

```ts
  detour: HTMLButtonElement;
```

and to the returned object after `lyricsOffset: byId('lyrics-offset'),`:

```ts
    detour: byId('detour'),
```

- [ ] **Step 3: Wire main.ts** — all edits to `src/main.ts`:

**3a.** Add imports (after the existing `route/` imports):

```ts
import { fetchPois } from './route/overpass';
import {
  categoryHints,
  corridorBbox,
  detourMargin,
  needsDetour,
  selectWaypoints,
  SPEED_MPS,
  targetLength,
  type Poi,
} from './route/detour';
import { extractKeywords } from './lyrics/keywords';
```

**3b.** Extend the `state` object type with two fields:

```ts
  /** POI du détour appliqué, dans l'ordre du trajet. */
  detourPois?: Poi[];
  /** Trajet direct sauvegardé pour « Remove detour ». */
  directRoute?: RouteGeometry;
```

**3c.** Add the detour block after the `player` creation and before `tryBuildSegments`:

```ts
const detourMarkers: maplibregl.Marker[] = [];

function clearDetour(): void {
  detourMarkers.forEach((m) => m.remove());
  detourMarkers.length = 0;
  state.detourPois = undefined;
  state.directRoute = undefined;
  c.detour.textContent = '✨ Add a detour';
  c.detour.hidden = true;
  c.detour.disabled = false;
}

// Le bouton n'apparaît que si la chanson dépasse nettement la durée estimée du trajet.
function updateDetourOffer(): void {
  if (state.detourPois) return; // détour appliqué : le bouton affiche déjà « Remove »
  const profile = c.profile.value as Profile;
  const offer =
    state.route !== undefined &&
    state.duration !== undefined &&
    needsDetour(state.route.total, state.duration, profile);
  const wasHidden = c.detour.hidden;
  c.detour.hidden = !offer;
  if (offer && wasHidden && state.route && state.duration) {
    const extraMin = (state.duration - state.route.total / SPEED_MPS[profile]) / 60;
    status(`The song outlasts the trip by ~${Math.max(1, Math.round(extraMin))} min — add a scenic detour?`);
  }
}

function fitRoute(): void {
  if (!state.route) return;
  const { coords } = state.route;
  const bounds = coords.reduce(
    (b, p) => b.extend(p),
    new maplibregl.LngLatBounds(coords[0], coords[0]),
  );
  map.fitBounds(bounds, { padding: 80 });
}

async function applyDetour(): Promise<void> {
  if (!state.route || !state.duration || !state.start || !state.end) return;
  const profile = c.profile.value as Profile;
  const target = targetLength(state.duration, profile);
  c.detour.disabled = true;
  status('Searching for a scenic detour…');
  try {
    const bbox = corridorBbox(state.route.coords, detourMargin(target - state.route.total));
    const pois = await fetchPois(bbox);
    const keywords = state.lyrics ? extractKeywords(state.lyrics) : new Set<string>();
    const { waypoints } = selectWaypoints(pois, {
      start: state.start,
      end: state.end,
      directLength: state.route.total,
      target,
      keywords,
      hints: categoryHints(keywords),
    });
    if (waypoints.length === 0) {
      status('No interesting detour found nearby.');
      return;
    }
    const coords = await fetchRoute(
      [state.start, ...waypoints.map((w) => w.lngLat), state.end],
      profile,
    );
    state.directRoute = state.route;
    state.route = buildRouteGeometry(coords);
    state.detourPois = waypoints;
    for (const w of waypoints) {
      detourMarkers.push(
        new maplibregl.Marker({ color: '#f59e0b' }).setLngLat(w.lngLat).addTo(map),
      );
    }
    fitRoute();
    tryBuildSegments();
    const names = waypoints.map((w) => w.name ?? 'a scenic spot').join(', ');
    const addedKm = (state.route.total - state.directRoute.total) / 1000;
    status(`Detour via ${names} (+${addedKm.toFixed(1)} km).`);
    c.detour.textContent = '✕ Remove detour';
    c.detour.hidden = false;
  } catch (err) {
    status(`Detour error: ${(err as Error).message}`);
  } finally {
    c.detour.disabled = false;
  }
}

function removeDetour(): void {
  if (!state.directRoute) return;
  state.route = state.directRoute;
  clearDetour();
  fitRoute();
  tryBuildSegments();
  updateDetourOffer();
  status(`Route: ${(state.route.total / 1000).toFixed(1)} km.`);
}

c.detour.addEventListener('click', () => {
  if (state.detourPois) removeDetour();
  else void applyDetour();
});
```

**3d.** In `computeRoute()`: a new start/end invalidates any applied detour — add `clearDetour();` as the first line of the `try` block; replace the inline `bounds`/`fitBounds` lines (90–94) with `fitRoute();`; add `updateDetourOffer();` right after `tryBuildSegments();`.

**3e.** In `tryBuildSegments()`: no change (detour offer is driven from `computeRoute` and `loadAudioFile`, which own route/duration changes).

**3f.** In `loadAudioFile()`: after `state.duration = await player.load(file);` succeeds (after the `catch` return), add `updateDetourOffer();`.

**3g.** In the `resetRoute` handler: add `clearDetour();` before `state.start = state.end = …`, and `state.directRoute` is already cleared by `clearDetour`.

- [ ] **Step 4: Tick the roadmap** — in `TODO.md`, change:

```markdown
- [x] POI detours when song longer than route: suggest waypoints via Overpass API + OSRM
```

- [ ] **Step 5: Full verification**

Run: `npm test` and `npm run typecheck`
Expected: all tests pass, no type errors.

- [ ] **Step 6: Smoke test in the browser**

Run `npm run dev`, open the served URL with Playwright:
- The map loads, the panel shows the new (hidden) detour button — `document.getElementById('detour').hidden === true`.
- No console errors.
- Optional live check (real Overpass/OSRM calls): set two nearby points in Paris via the address inputs, load a sample audio from `samples/` (if present) or any local MP3, and confirm the «✨ Add a detour» button appears and applies a detour with amber markers.

- [ ] **Step 7: Commit**

```bash
git add index.html src/ui/controls.ts src/main.ts TODO.md
git commit -m "feat: one-click scenic POI detour when the song outlasts the route"
```
