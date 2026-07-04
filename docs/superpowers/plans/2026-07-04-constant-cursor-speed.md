# Constant Realistic Cursor Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le curseur avance à vitesse constante et réaliste (durée estimée OSRM) au lieu d'étirer la chanson sur toute la longueur du trajet ; si la chanson finit avant l'arrivée, le voyage continue en silence à la même vitesse.

**Architecture:** La réponse OSRM porte déjà une durée estimée — on la propage dans `RouteGeometry`. La projection temps→distance devient `d(t) = clamp(v × t, 0, total)` avec `v = total / durée` (fallback `SPEED_MPS[profile]`). Le temps de voyage reste `audio.currentTime` pendant la lecture ; après `ended`, un petit module rAF (`journeyClock`) fait avancer le temps en silence jusqu'à l'arrivée.

**Tech Stack:** TypeScript strict, Vite, Vitest (tests purs, pas de jsdom), MapLibre GL. Spec : `docs/superpowers/specs/2026-07-04-constant-cursor-speed-design.md`.

## Global Constraints

- Vérification par tâche : `npm run typecheck` (`tsc --noEmit`) + `npm test` (`vitest run`). **ESLint n'est pas configuré dans ce repo** — ne pas prétendre l'avoir lancé.
- Textes UI en anglais (statuts) ; commentaires de code en français (convention du repo).
- Commits fréquents, un par tâche minimum, format `feat:`/`refactor:`/`test:`.
- Pas de nouvelle dépendance.
- `src/main.ts` n'a pas de fichier de test (module DOM/carte, non testé — convention existante) : sa vérification est le typecheck + le smoke test final de la tâche 5.

---

### Task 1: Propager la durée OSRM dans `fetchRoute` et `RouteGeometry`

**Files:**
- Modify: `src/route/routing.ts`
- Modify: `src/route/routing.test.ts`
- Modify: `src/route/geometry.ts`
- Modify: `src/route/geometry.test.ts`
- Modify: `src/main.ts` (call sites uniquement — comportement inchangé)

**Interfaces:**
- Consumes: réponse OSRM (`routes[0].duration`, secondes, déjà présente dans l'API).
- Produces: `fetchRoute(points, profile): Promise<{ coords: LngLat[]; duration: number }>` ; `buildRouteGeometry(coords: LngLat[], durationSec = 0): RouteGeometry` ; `RouteGeometry.duration: number` (0 = inconnue).

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `src/route/routing.test.ts`, adapter le premier test de `fetchRoute` (le mock et l'assertion) et ajouter un test de fallback :

```ts
  it('appelle le bon profil OSRM et renvoie coordonnées GeoJSON + durée', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [{ duration: 321, geometry: { coordinates: [[2.3, 48.8], [2.4, 48.9]] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const route = await fetchRoute([[2.3, 48.8], [2.4, 48.9]], 'foot');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('routing.openstreetmap.de/routed-foot/');
    expect(url).toContain('2.3,48.8;2.4,48.9');
    expect(url).toContain('geometries=geojson');
    expect(route.coords).toEqual([[2.3, 48.8], [2.4, 48.9]]);
    expect(route.duration).toBe(321);
  });

  it('durée absente dans la réponse → 0 (fallback géré en aval)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'Ok', routes: [{ geometry: { coordinates: [[0, 0]] } }] }),
    }));
    const route = await fetchRoute([[0, 0], [1, 1]], 'car');
    expect(route.duration).toBe(0);
  });
```

Le test existant « enchaîne les waypoints » ne lit que l'URL : inchangé.

Dans `src/route/geometry.test.ts`, compléter le describe `buildRouteGeometry` :

```ts
  it('porte la durée OSRM quand elle est fournie, 0 sinon', () => {
    expect(buildRouteGeometry([[0, 0], [1, 0]], 350).duration).toBe(350);
    expect(buildRouteGeometry([[0, 0], [1, 0]]).duration).toBe(0);
  });
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `npm test`
Expected: FAIL — `route.coords`/`route.duration` undefined (fetchRoute renvoie un tableau) et `duration` absent de `RouteGeometry`.

- [ ] **Step 3: Implémenter**

`src/route/routing.ts` — remplacer `OsrmResponse` et `fetchRoute` :

```ts
interface OsrmResponse {
  code: string;
  routes?: { duration?: number; geometry: { coordinates: LngLat[] } }[];
}

export interface FetchedRoute {
  coords: LngLat[];
  /** Durée estimée par OSRM (s) ; 0 si absente. */
  duration: number;
}

/** Itinéraire via les serveurs OSRM publics FOSSGIS ; `points` = départ, waypoints, arrivée. */
export async function fetchRoute(points: LngLat[], profile: Profile): Promise<FetchedRoute> {
  const pairs = points.map((p) => `${p[0]},${p[1]}`).join(';');
  const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${pairs}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing: HTTP ${res.status}`);
  const data = (await res.json()) as OsrmResponse;
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found');
  const route = data.routes[0];
  return { coords: route.geometry.coordinates, duration: route.duration ?? 0 };
}
```

`src/route/geometry.ts` — champ + paramètre :

```ts
export interface RouteGeometry {
  coords: LngLat[];
  /** Distance cumulée (m) du départ jusqu'à chaque sommet. */
  cumulative: number[];
  /** Longueur totale du trajet (m). */
  total: number;
  /** Durée estimée du trajet (s) ; 0 = inconnue. */
  duration: number;
}
```

```ts
export function buildRouteGeometry(coords: LngLat[], durationSec = 0): RouteGeometry {
  const cumulative = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulative.push(cumulative[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  return { coords, cumulative, total: cumulative[cumulative.length - 1], duration: durationSec };
}
```

`src/main.ts` — deux call sites (le typecheck les trouve) :

Dans `computeRoute` :

```ts
    const { coords, duration } = await fetchRoute([state.start, state.end], c.profile.value as Profile);
    state.route = buildRouteGeometry(coords, duration);
```

Dans `applyDetour` (remplace `const coords = await fetchRoute(...)` et le `buildRouteGeometry` trois lignes plus bas) :

```ts
    const detourRoute = await fetchRoute(
      [state.start, ...waypoints.map((w) => w.lngLat), state.end],
      profile,
    );
    if (state.route !== routeAtStart) return;
    state.directRoute = state.route;
    state.route = buildRouteGeometry(detourRoute.coords, detourRoute.duration);
```

- [ ] **Step 4: Vérifier**

Run: `npm run typecheck && npm test`
Expected: PASS (tous les tests, y compris detour/overpass/timeline intouchés — `buildRouteGeometry` à un argument reste valide).

Puis balayage des références (pas d'AST, grep obligatoire) :

Run: `grep -rn "fetchRoute\|buildRouteGeometry" src --include="*.ts" | grep -v "\.test\.ts"`
Expected: uniquement `routing.ts` (déf), `geometry.ts` (déf), `main.ts` (2 usages chacun, mis à jour ci-dessus).

- [ ] **Step 5: Commit**

```bash
git add src/route/routing.ts src/route/routing.test.ts src/route/geometry.ts src/route/geometry.test.ts src/main.ts
git commit -m "feat: carry OSRM estimated duration through fetchRoute and RouteGeometry"
```

---

### Task 2: Vitesse moyenne du trajet + projection à vitesse constante

C'est la tâche qui corrige le bug : après elle, le curseur ne dépasse plus jamais la vitesse plausible du trajet.

**Files:**
- Modify: `src/route/detour.ts`
- Modify: `src/route/detour.test.ts`
- Modify: `src/sync/timeline.ts`
- Modify: `src/sync/timeline.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `RouteGeometry.duration` (Task 1), `SPEED_MPS` (existant dans `detour.ts`).
- Produces: `averageSpeed(route: RouteGeometry, profile: Profile): number` (m/s) dans `route/detour.ts` ; `distanceAtTime(t: number, speedMps: number, total: number): number` ; `buildSegments(lines: LyricLine[], route: RouteGeometry, speedMps: number): LyricSegment[]`.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `src/route/detour.test.ts`, ajouter (importer `averageSpeed` et `type { RouteGeometry } from './geometry'`) :

```ts
describe('averageSpeed', () => {
  const route = (total: number, duration: number): RouteGeometry => ({
    coords: [],
    cumulative: [],
    total,
    duration,
  });

  it('durée OSRM disponible : vitesse = distance / durée', () => {
    expect(averageSpeed(route(5000, 500), 'foot')).toBe(10);
  });

  it('durée absente ou nulle : fallback sur la vitesse forfaitaire du profil', () => {
    expect(averageSpeed(route(5000, 0), 'foot')).toBeCloseTo(1.3);
    expect(averageSpeed(route(5000, 0), 'car')).toBeCloseTo(11.1);
  });
});
```

Dans `src/sync/timeline.test.ts`, remplacer le describe `distanceAtTime` et adapter `buildSegments` (le 3ᵉ argument devient une vitesse) :

```ts
describe('distanceAtTime', () => {
  it('avance à vitesse constante, bornée au trajet', () => {
    expect(distanceAtTime(10, 50, 1000)).toBe(500);
    expect(distanceAtTime(-5, 50, 1000)).toBe(0);
    expect(distanceAtTime(25, 50, 1000)).toBe(1000);
    expect(distanceAtTime(5, 0, 1000)).toBe(0);
  });
});
```

```ts
describe('buildSegments', () => {
  it('attribue à chaque ligne le tronçon parcouru pendant son intervalle de temps', () => {
    const v = route.total / 20; // la chanson (20 s) couvre exactement le trajet
    const segs = buildSegments(lines, route, v);
    expect(segs).toHaveLength(2);
    expect(segs[0].id).toBe(0);
    expect(segs[0].coords[0]).toEqual([0, 0]);
    expect(segs[0].coords[segs[0].coords.length - 1][0]).toBeCloseTo(1, 5);
    expect(segs[1].coords[0][0]).toBeCloseTo(1, 5);
    expect(segs[1].coords[segs[1].coords.length - 1][0]).toBeCloseTo(2, 5);
  });

  it('chanson plus courte que le trajet : les paroles occupent le tronçon initial', () => {
    const v = route.total / 40; // en 20 s de chanson on ne parcourt que la moitié
    const segs = buildSegments(lines, route, v);
    expect(segs[0].coords[segs[0].coords.length - 1][0]).toBeCloseTo(0.5, 5);
    expect(segs[1].coords[segs[1].coords.length - 1][0]).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `npm test`
Expected: FAIL — `averageSpeed` n'existe pas ; `distanceAtTime(10, 50, 1000)` vaut 200 (ancienne sémantique durée) au lieu de 500.

- [ ] **Step 3: Implémenter**

`src/route/detour.ts` — sous `SPEED_MPS`, ajouter (et compléter l'import geometry en `import { haversine, type LngLat, type RouteGeometry } from './geometry';`) :

```ts
/** Vitesses de référence par profil (m/s), fallback quand OSRM ne fournit pas de durée. */
export const SPEED_MPS: Record<Profile, number> = { foot: 1.3, bike: 4.2, car: 11.1 };

/** Vitesse moyenne du trajet (m/s) : durée OSRM si disponible, sinon forfait du profil. */
export function averageSpeed(route: RouteGeometry, profile: Profile): number {
  return route.duration > 0 ? route.total / route.duration : SPEED_MPS[profile];
}
```

(Seule la docstring de `SPEED_MPS` change ; la constante reste identique.)

`src/sync/timeline.ts` — remplacer `distanceAtTime` et `buildSegments` :

```ts
/** Distance parcourue à vitesse constante : d(t) = clamp(v × t, 0, total). */
export function distanceAtTime(t: number, speedMps: number, total: number): number {
  if (speedMps <= 0) return 0;
  return Math.min(Math.max(t * speedMps, 0), total);
}

export function buildSegments(
  lines: LyricLine[],
  route: RouteGeometry,
  speedMps: number,
): LyricSegment[] {
  return lines.map((line, id) => ({
    id,
    text: line.text,
    start: line.start,
    end: line.end,
    coords: sliceRoute(
      route,
      distanceAtTime(line.start, speedMps, route.total),
      distanceAtTime(line.end, speedMps, route.total),
    ),
  }));
}
```

Mettre à jour le doc-comment du champ `coords` de `LyricSegment` si besoin (« tronçon parcouru pendant la ligne ») et celui du module.

`src/main.ts` — trois retouches :

1. Import : ajouter `averageSpeed` à l'import depuis `./route/detour`.

2. Le tick du player (remplace le corps existant) :

```ts
const player = createPlayer((t) => {
  if (!state.route || !state.words) return;
  const speed = averageSpeed(state.route, c.profile.value as Profile);
  const pos = pointAt(state.route, distanceAtTime(t, speed, state.route.total));
  cursor.setLngLat(pos);
  followPoint(map, pos, zoomFloorArmed ? Math.max(map.getZoom(), TRAVEL_ZOOM) : undefined);
  updateLyricStates(map, state.words, t);
});
```

3. `tryBuildSegments` (les deux lignes qui utilisaient `state.duration` pour la projection) :

```ts
  const speed = averageSpeed(state.route, c.profile.value as Profile);
  state.words = layoutWords(buildSegments(lines, state.route, speed));
```

et plus bas :

```ts
  const d = distanceAtTime(player.audio.currentTime, speed, state.route.total);
```

Le garde d'entrée `if (!state.route || !state.lyrics || !state.duration) return;` reste (la durée audio conditionne toujours la présence de paroles synchronisées).

- [ ] **Step 4: Vérifier**

Run: `npm run typecheck && npm test`
Expected: PASS.

Balayage des références de l'ancienne signature :

Run: `grep -rn "distanceAtTime\|buildSegments" src --include="*.ts" | grep -v "\.test\.ts"`
Expected: `timeline.ts` (défs) et `main.ts` (3 usages mis à jour). Aucun autre appelant.

- [ ] **Step 5: Commit**

```bash
git add src/route/detour.ts src/route/detour.test.ts src/sync/timeline.ts src/sync/timeline.test.ts src/main.ts
git commit -m "feat: cursor moves at constant realistic speed derived from OSRM duration"
```

---

### Task 3: Détour et statuts recalés sur la durée OSRM + `formatDuration`

**Files:**
- Create: `src/ui/format.ts`
- Create: `src/ui/format.test.ts`
- Modify: `src/route/detour.ts`
- Modify: `src/route/detour.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `averageSpeed` (Task 2).
- Produces: `formatDuration(seconds: number): string` (`"45 min"`, `"1 h 06"`, `"2 d 4 h"`, `"<1 min"`) ; `targetLength(durationSec: number, speedMps: number): number` ; `needsDetour(routeTotal: number, durationSec: number, speedMps: number): boolean` ; helper `travelSeconds(): number` dans `main.ts` (durée estimée du trajet courant, réutilisée en Task 4).

- [ ] **Step 1: Écrire les tests qui échouent**

Create `src/ui/format.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { formatDuration } from './format';

describe('formatDuration', () => {
  it('arrondit sous la minute', () => {
    expect(formatDuration(30)).toBe('<1 min');
    expect(formatDuration(-5)).toBe('<1 min');
  });

  it('minutes seules sous l\'heure', () => {
    expect(formatDuration(45 * 60)).toBe('45 min');
  });

  it('heures et minutes sur deux chiffres', () => {
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(3960)).toBe('1 h 06');
  });

  it('jours et heures au-delà de 24 h', () => {
    expect(formatDuration(2 * 86400 + 4 * 3600)).toBe('2 d 4 h');
    expect(formatDuration(3 * 86400)).toBe('3 d');
  });
});
```

Dans `src/route/detour.test.ts`, remplacer le describe `targetLength / needsDetour` (les signatures prennent une vitesse, plus un profil) :

```ts
describe('targetLength / needsDetour', () => {
  it('cible = durée × vitesse', () => {
    expect(targetLength(300, 1.3)).toBeCloseTo(390);
  });

  it('détour proposé quand la chanson dépasse la durée du trajet de 20 %', () => {
    // 1000 m à 1,3 m/s ≈ 769 s ; seuil ×1,2 ≈ 923 s.
    expect(needsDetour(1000, 1000, 1.3)).toBe(true);
    expect(needsDetour(1000, 900, 1.3)).toBe(false);
  });

  it('tient compte de la vitesse (plus on va vite, plus il faut de chanson)', () => {
    expect(needsDetour(10000, 1000, 11.1)).toBe(false);
    expect(needsDetour(10000, 1200, 11.1)).toBe(true);
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `npm test`
Expected: FAIL — module `./format` inexistant ; `targetLength(300, 1.3)` renvoie `NaN` avec l'ancienne implémentation (`SPEED_MPS[1.3]` → `undefined` ; Vitest ne type-checke pas, le test échoue sur la valeur).

- [ ] **Step 3: Implémenter**

Create `src/ui/format.ts` :

```ts
/** Durée lisible pour les statuts : "45 min", "1 h 06", "2 d 4 h". Deux unités max. */
export function formatDuration(seconds: number): string {
  const min = Math.round(Math.max(0, seconds) / 60);
  if (min < 1) return '<1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr === 0 ? `${d} d` : `${d} d ${hr} h`;
}
```

`src/route/detour.ts` — remplacer `targetLength` et `needsDetour` :

```ts
/** Longueur de trajet (m) qui occuperait toute la chanson à la vitesse donnée. */
export function targetLength(durationSec: number, speedMps: number): number {
  return durationSec * speedMps;
}

export function needsDetour(routeTotal: number, durationSec: number, speedMps: number): boolean {
  return targetLength(durationSec, speedMps) > routeTotal * DETOUR_RATIO;
}
```

`src/main.ts` :

1. Imports : ajouter `formatDuration` (`./ui/format`) ; retirer `SPEED_MPS` de l'import `./route/detour` (il n'est plus utilisé ici après ce qui suit).

2. Helper sous la déclaration de `state` :

```ts
/** Durée estimée (s) du trajet courant à vitesse réaliste. */
function travelSeconds(): number {
  if (!state.route) return 0;
  return state.route.total / averageSpeed(state.route, c.profile.value as Profile);
}
```

3. `updateDetourOffer` (remplace le corps) :

```ts
function updateDetourOffer(): void {
  if (state.detourPois) return; // détour appliqué : le bouton affiche déjà « Remove »
  if (!state.route || state.duration === undefined) {
    c.detour.hidden = true;
    return;
  }
  const speed = averageSpeed(state.route, c.profile.value as Profile);
  const offer = needsDetour(state.route.total, state.duration, speed);
  const wasHidden = c.detour.hidden;
  c.detour.hidden = !offer;
  if (offer && wasHidden) {
    const extra = state.duration - travelSeconds();
    status(`The song outlasts the trip by ~${formatDuration(extra)} — add a scenic detour?`);
  }
}
```

4. `applyDetour` — la ligne `const target = ...` devient :

```ts
  const target = targetLength(state.duration, averageSpeed(state.route, profile));
```

5. Statuts distance + durée : dans `computeRoute` et `removeDetour`, remplacer la ligne `status(\`Route: ...\`)` par :

```ts
  status(`Route: ${(state.route.total / 1000).toFixed(1)} km · ~${formatDuration(travelSeconds())}.`);
```

- [ ] **Step 4: Vérifier**

Run: `npm run typecheck && npm test`
Expected: PASS.

Balayages (références directes, types, littéraux) :

Run: `grep -rn "SPEED_MPS\|targetLength\|needsDetour" src --include="*.ts" | grep -v "\.test\.ts"`
Expected: tout dans `detour.ts` (défs + usage interne par `averageSpeed`) et `main.ts` (usages à jour). Plus aucun import `SPEED_MPS` dans `main.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/ui/format.ts src/ui/format.test.ts src/route/detour.ts src/route/detour.test.ts src/main.ts
git commit -m "feat: detour offer and route status use OSRM travel time"
```

---

### Task 4: Phase silencieuse — le voyage continue après la chanson

**Files:**
- Create: `src/sync/journeyClock.ts`
- Create: `src/sync/journeyClock.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `travelSeconds()` (Task 3), `distanceAtTime`/`averageSpeed` (Task 2), `formatDuration` (Task 3).
- Produces: `startSilentJourney(from: number, until: number, onTick: (t: number) => void, onArrive: () => void): SilentJourney` avec `SilentJourney = { cancel(): void }`.

- [ ] **Step 1: Écrire les tests qui échouent**

Create `src/sync/journeyClock.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startSilentJourney } from './journeyClock';

// rAF simulé : file de callbacks qu'on « pompe » avec un horodatage choisi.
let queue: Map<number, FrameRequestCallback>;
let nextId: number;

beforeEach(() => {
  queue = new Map();
  nextId = 1;
  vi.stubGlobal('performance', { now: () => 0 });
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
});
afterEach(() => vi.unstubAllGlobals());

function pump(nowMs: number): void {
  const pending = [...queue.values()];
  queue.clear();
  pending.forEach((cb) => cb(nowMs));
}

describe('startSilentJourney', () => {
  it('avance au rythme du temps réel à partir de `from`', () => {
    const ticks: number[] = [];
    startSilentJourney(10, 100, (t) => ticks.push(t), () => {});
    pump(1000);
    pump(2500);
    expect(ticks).toEqual([11, 12.5]);
  });

  it('clampe à `until`, appelle onArrive une fois et ne reprogramme plus de frame', () => {
    const ticks: number[] = [];
    const arrive = vi.fn();
    startSilentJourney(90, 100, (t) => ticks.push(t), arrive);
    pump(20000);
    expect(ticks).toEqual([100]);
    expect(arrive).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
  });

  it('cancel() stoppe les ticks et vide la frame en attente', () => {
    const ticks: number[] = [];
    const journey = startSilentJourney(0, 100, (t) => ticks.push(t), () => {});
    pump(1000);
    journey.cancel();
    pump(2000);
    expect(ticks).toEqual([1]);
    expect(queue.size).toBe(0);
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `npm test`
Expected: FAIL — module `./journeyClock` inexistant.

- [ ] **Step 3: Implémenter le module**

Create `src/sync/journeyClock.ts` :

```ts
export interface SilentJourney {
  /** Interrompt la progression (pause ou reset) ; idempotent. */
  cancel(): void;
}

/**
 * Phase silencieuse du voyage : la chanson est finie mais la destination pas
 * atteinte. Fait avancer le temps de voyage au rythme du temps réel, de `from`
 * à `until` (secondes), via requestAnimationFrame. Appelle onTick(t) à chaque
 * frame, puis onTick(until) et onArrive() à l'arrivée.
 */
export function startSilentJourney(
  from: number,
  until: number,
  onTick: (t: number) => void,
  onArrive: () => void,
): SilentJourney {
  const t0 = performance.now();
  let raf = 0;
  let done = false;
  const frame = (now: number): void => {
    if (done) return;
    const t = from + (now - t0) / 1000;
    if (t >= until) {
      done = true;
      onTick(until);
      onArrive();
      return;
    }
    onTick(t);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return {
    cancel() {
      done = true;
      cancelAnimationFrame(raf);
    },
  };
}
```

- [ ] **Step 4: Vérifier que les tests du module passent**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Câbler `main.ts`**

1. Import :

```ts
import { startSilentJourney, type SilentJourney } from './sync/journeyClock';
```

2. Sous la déclaration du `state`, l'état du voyage :

```ts
/** Phase silencieuse en cours (chanson finie, voyage pas terminé). */
let silentJourney: SilentJourney | undefined;
/** Dernier temps de voyage rendu (s) — audio.currentTime pendant la lecture. */
let journeyT = 0;
```

3. Extraire le rendu du tick (le callback passé à `createPlayer` devient une fonction nommée, utilisée par l'audio ET la phase silencieuse) :

```ts
function renderAt(t: number): void {
  if (!state.route || !state.words) return;
  journeyT = t;
  const speed = averageSpeed(state.route, c.profile.value as Profile);
  const pos = pointAt(state.route, distanceAtTime(t, speed, state.route.total));
  cursor.setLngLat(pos);
  followPoint(map, pos, zoomFloorArmed ? Math.max(map.getZoom(), TRAVEL_ZOOM) : undefined);
  updateLyricStates(map, state.words, t);
}

const player = createPlayer(renderAt);
```

4. Gestion de la phase silencieuse (près de `travelSeconds`) :

```ts
function stopSilentJourney(): void {
  silentJourney?.cancel();
  silentJourney = undefined;
}

function arrive(): void {
  c.play.textContent = '▶ Replay the journey';
  status('Arrived!');
}

/** Démarre (ou reprend) la progression silencieuse depuis `from` secondes. */
function startSilentPhase(from: number): void {
  stopSilentJourney();
  const until = travelSeconds();
  if (from >= until) {
    arrive();
    return;
  }
  status(`Music over — the journey continues in silence (~${formatDuration(until - from)} to go).`);
  c.play.textContent = '⏸ Pause';
  silentJourney = startSilentJourney(from, until, renderAt, () => {
    silentJourney = undefined;
    arrive();
  });
}

/** Un changement de route ou de profil modifie la vitesse : recale la phase silencieuse. */
function resyncSilentPhase(): void {
  if (silentJourney) startSilentPhase(journeyT);
}
```

5. Remplacer le listener `ended` existant (celui qui mettait « Replay ») :

```ts
player.audio.addEventListener('ended', () => {
  // player.ts a déjà émis onTick(audio.duration) : journeyT est à jour.
  if (journeyT < travelSeconds()) startSilentPhase(journeyT);
  else arrive();
});
```

6. Remplacer le handler du bouton play :

```ts
c.play.addEventListener('click', async () => {
  // Phase silencieuse en cours : le bouton met le voyage en pause.
  if (silentJourney) {
    stopSilentJourney();
    c.play.textContent = '▶ Resume';
    return;
  }
  // Phase silencieuse en pause : reprise (la musique, elle, est finie).
  if (player.audio.ended && journeyT < travelSeconds()) {
    startSilentPhase(journeyT);
    return;
  }
  if (player.audio.paused) {
    if (player.audio.ended) player.audio.currentTime = 0;
    // Only re-arm the zoom floor when starting from the beginning (first play or
    // replay-after-ended, which seeks to 0 above). Resuming mid-song must not
    // discard the user's manual zoom choice.
    if (player.audio.currentTime === 0) {
      zoomFloorArmed = true;
      map.easeTo({ zoom: Math.max(map.getZoom(), TRAVEL_ZOOM), duration: 800 });
    }
    try {
      await player.play();
      c.play.textContent = '⏸ Pause';
    } catch (err) {
      c.play.textContent = '▶ Start the journey';
      status(`Playback failed: ${(err as Error).message}`);
    }
  } else {
    player.pause();
    c.play.textContent = '▶ Resume';
  }
});
```

7. Nettoyages aux points de reset :
   - `c.resetRoute` listener : ajouter `stopSilentJourney(); journeyT = 0;` juste après `player.pause();`.
   - `loadAudioFile` : ajouter `stopSilentJourney(); journeyT = 0;` en tête des invalidations (avant `state.lyrics = undefined;`).
   - `tryBuildSegments` : la ligne du curseur utilise le temps de voyage courant :

```ts
  const d = distanceAtTime(journeyT, speed, state.route.total);
```

8. Recalage sur changement de route/vitesse — ajouter `resyncSilentPhase();` :
   - fin de `computeRoute` (après `updateDetourOffer();`),
   - fin du bloc succès d'`applyDetour` (après `c.detour.hidden = false;`),
   - fin de `removeDetour` (après le `status(...)`),
   - listener `c.profile` `change` : `c.profile.addEventListener('change', () => { updateDetourOffer(); resyncSilentPhase(); });`

- [ ] **Step 6: Vérifier**

Run: `npm run typecheck && npm test`
Expected: PASS.

Balayage : plus aucune référence à l'ancien libellé du listener ended.

Run: `grep -n "Replay the journey" src/main.ts`
Expected: une seule occurrence, dans `arrive()`.

- [ ] **Step 7: Commit**

```bash
git add src/sync/journeyClock.ts src/sync/journeyClock.test.ts src/main.ts
git commit -m "feat: journey continues in silence at realistic speed after the song ends"
```

---

### Task 5: Vérification finale de bout en bout

**Files:**
- Aucune création ; corrections éventuelles uniquement.

- [ ] **Step 1: Suite complète**

Run: `npm run typecheck && npm test`
Expected: PASS — 0 erreur TypeScript, tous les tests verts (ESLint : non configuré dans ce repo, rien à lancer).

- [ ] **Step 2: Smoke test manuel (obligatoire — le cœur du bug)**

Run: `npm run dev` puis dans le navigateur :

1. Trajet court (15 rue Leibniz, Paris → Mairie du 18e Jules Joffrin, profil foot) + un MP3 : statut `Route: … km · ~… min`, curseur à allure de marche ; si la chanson est plus longue que le trajet, l'offre de détour apparaît, sinon le curseur arrive avant la fin et la chanson se termine sur place.
2. Trajet long (Paris → Lorient, profil car) + le même MP3 : le curseur roule à allure autoroute (PAS supersonique — c'est le bug d'origine), les paroles se posent sur les premiers kilomètres ; à la fin de la chanson, statut `Music over — the journey continues in silence (~… to go)` et le curseur continue.
3. Pendant la phase silencieuse : bouton ⏸ → le curseur s'arrête (`▶ Resume`) ; re-clic → reprise au même endroit.
4. `Reset route` pendant la phase silencieuse : plus aucun mouvement de curseur ensuite.

- [ ] **Step 3: Commit final si des corrections ont eu lieu, sinon rien**

```bash
git status
```

Expected: arbre propre (chaque tâche a déjà commité).
