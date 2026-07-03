# Lyric Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App web statique où les paroles synchronisées d'un morceau s'écrivent le long d'un itinéraire sur une carte, la position sur le trajet suivant la position dans le morceau (spec : `docs/superpowers/specs/2026-07-03-lyric-route-design.md`).

**Architecture:** Front-end pur (Vite + TypeScript), MapLibre GL JS pour le rendu carte (texte le long de lignes via couche `symbol`). Logique pure (parseurs, géométrie, mapping temps→distance) isolée dans des modules testés par Vitest ; DOM/carte câblés dans `main.ts`.

**Tech Stack:** Vite, TypeScript (strict), MapLibre GL JS, music-metadata (tags ID3), Vitest. Services externes : tuiles `tiles.openfreemap.org`, routage `routing.openstreetmap.de` (OSRM/FOSSGIS), géocodage `nominatim.openstreetmap.org`, paroles `lrclib.net`.

## Global Constraints

- Avant toute commande CLI : `export PATH="/opt/homebrew/bin:$PATH"` (directive utilisateur).
- Interface entièrement en **français**.
- Aucun backend, aucune clé API, aucun secret.
- TypeScript strict ; avant CHAQUE commit : `npx tsc --noEmit` et `npx vitest run` doivent passer (directive utilisateur « forced verification »).
- Types partagés : `LngLat = [number, number]` (ordre **lng, lat**, comme GeoJSON) ; temps en **secondes**, distances en **mètres**.
- Répertoire de travail : `/Users/willow/Sites/LearningShow20_Gmaps_fun`.

---

### Task 1: Scaffold du projet

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `index.html`, `src/style.css`, `src/main.ts`

**Interfaces:**
- Consumes: rien.
- Produces: scripts npm `dev`, `build`, `test`, `typecheck` ; `index.html` avec les ids DOM utilisés par la Task 9 (`map`, `panel`, `search-start`, `search-end`, `profile`, `reset-route`, `audio-file`, `artist`, `title`, `fetch-lyrics`, `lyrics-file`, `play`, `status`).

- [ ] **Step 1: Initialiser npm et installer les dépendances**

```bash
export PATH="/opt/homebrew/bin:$PATH"
cd /Users/willow/Sites/LearningShow20_Gmaps_fun
npm init -y
npm install maplibre-gl music-metadata
npm install -D vite typescript vitest @types/geojson
```

- [ ] **Step 2: Écrire `package.json` (scripts), `tsconfig.json`, `.gitignore`**

Dans `package.json`, remplacer la section `scripts` par :

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc --noEmit"
  }
}
```

et ajouter `"type": "module"` à la racine du JSON.

`tsconfig.json` :

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src"]
}
```

`.gitignore` :

```
node_modules/
dist/
```

- [ ] **Step 3: Écrire `index.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lyric Route</title>
  </head>
  <body>
    <div id="map"></div>
    <aside id="panel">
      <h1>Lyric Route</h1>
      <section>
        <h2>1. Trajet</h2>
        <p class="hint">Clique sur la carte : départ, puis arrivée — ou cherche une adresse.</p>
        <input id="search-start" placeholder="Adresse de départ (Entrée)" />
        <input id="search-end" placeholder="Adresse d'arrivée (Entrée)" />
        <select id="profile">
          <option value="foot">À pied</option>
          <option value="bike">À vélo</option>
          <option value="car">En voiture</option>
        </select>
        <button id="reset-route">Réinitialiser le trajet</button>
      </section>
      <section>
        <h2>2. Musique</h2>
        <input type="file" id="audio-file" accept="audio/*" />
        <input id="artist" placeholder="Artiste" />
        <input id="title" placeholder="Titre" />
        <button id="fetch-lyrics">Chercher les paroles (lrclib)</button>
        <label class="hint">ou fichier .lrc / .vtt / .srt :
          <input type="file" id="lyrics-file" accept=".lrc,.vtt,.srt" />
        </label>
      </section>
      <section>
        <h2>3. Lecture</h2>
        <button id="play" disabled>▶ Lancer le voyage</button>
        <p id="status" class="hint">Clique sur la carte : départ, puis arrivée.</p>
      </section>
    </aside>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Écrire `src/style.css` et le `src/main.ts` provisoire**

`src/style.css` :

```css
html, body { height: 100%; margin: 0; font-family: system-ui, sans-serif; }
#map { position: absolute; inset: 0; }
#panel {
  position: absolute; top: 12px; left: 12px; z-index: 10; width: 300px;
  background: rgba(255, 255, 255, 0.95); border-radius: 12px; padding: 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  max-height: calc(100% - 24px); overflow-y: auto; box-sizing: border-box;
}
#panel h1 { font-size: 18px; margin: 0 0 8px; }
#panel h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 16px 0 6px; }
#panel input, #panel select, #panel button { width: 100%; box-sizing: border-box; margin: 4px 0; padding: 6px 8px; font: inherit; }
#panel button { cursor: pointer; }
#panel button:disabled { cursor: default; opacity: 0.5; }
.hint { font-size: 12px; color: #6b7280; }
```

`src/main.ts` (provisoire, remplacé en Task 9) :

```ts
import './style.css';

console.log('Lyric Route — scaffold OK');
```

- [ ] **Step 5: Vérifier typecheck, tests (aucun, doit passer) et serveur dev**

```bash
npx tsc --noEmit
npx vitest run --passWithNoTests
```

Attendu : les deux commandes sortent en code 0.

```bash
npm run dev &   # démarrer, vérifier que Vite affiche "Local: http://localhost:5173/", puis arrêter
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore index.html src/
git commit -m "chore: scaffold Vite + TypeScript + Vitest + MapLibre"
```

---

### Task 2: Types de paroles + parseur LRC

**Files:**
- Create: `src/lyrics/types.ts`, `src/lyrics/lrcParser.ts`
- Test: `src/lyrics/lrcParser.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `interface LyricLine { start: number; end: number; text: string }` (secondes) dans `src/lyrics/types.ts` ; `parseLrc(lrc: string, duration: number): LyricLine[]` — lignes triées par `start`, `end` = start de la ligne suivante (ou `duration` pour la dernière).

- [ ] **Step 1: Écrire les tests qui échouent**

`src/lyrics/lrcParser.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { parseLrc } from './lrcParser';

const SAMPLE = `[ti:Test]
[00:10.00]Première ligne
[00:20.50]Deuxième ligne

[00:05.00]Ligne d'intro`;

describe('parseLrc', () => {
  it('parse, trie par timestamp et chaîne les fins', () => {
    expect(parseLrc(SAMPLE, 30)).toEqual([
      { start: 5, end: 10, text: "Ligne d'intro" },
      { start: 10, end: 20.5, text: 'Première ligne' },
      { start: 20.5, end: 30, text: 'Deuxième ligne' },
    ]);
  });

  it('gère plusieurs timestamps sur une même ligne (refrains)', () => {
    expect(parseLrc('[00:01.00][00:03.00]Refrain', 5)).toEqual([
      { start: 1, end: 3, text: 'Refrain' },
      { start: 3, end: 5, text: 'Refrain' },
    ]);
  });

  it('ignore les métadonnées, lignes vides et timestamps sans texte', () => {
    expect(parseLrc('[ar:Artiste]\n[00:01.00]\n\n', 10)).toEqual([]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/lyrics/lrcParser.test.ts`
Expected: FAIL (« Failed to resolve import "./lrcParser" »).

- [ ] **Step 3: Implémenter**

`src/lyrics/types.ts` :

```ts
export interface LyricLine {
  /** Début de la ligne, en secondes. */
  start: number;
  /** Fin de la ligne, en secondes. */
  end: number;
  text: string;
}
```

`src/lyrics/lrcParser.ts` :

```ts
import type { LyricLine } from './types';

const TIMESTAMP_RE = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Parse un fichier .lrc. `duration` (secondes) sert de fin à la dernière ligne.
 * Les lignes invalides ou sans texte sont ignorées.
 */
export function parseLrc(lrc: string, duration: number): LyricLine[] {
  const entries: { time: number; text: string }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const times: number[] = [];
    TIMESTAMP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TIMESTAMP_RE.exec(raw))) {
      const fraction = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0;
      times.push(Number(m[1]) * 60 + Number(m[2]) + fraction);
    }
    const text = raw.replace(TIMESTAMP_RE, '').trim();
    if (times.length === 0 || text === '') continue;
    for (const time of times) entries.push({ time, text });
  }
  entries.sort((a, b) => a.time - b.time);
  return entries.map((e, i) => ({
    start: e.time,
    end: i + 1 < entries.length ? entries[i + 1].time : Math.max(duration, e.time),
    text: e.text,
  }));
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run src/lyrics/lrcParser.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lyrics/
git commit -m "feat: LRC parser with sorted, chained lyric lines"
```

---

### Task 3: Parseur VTT/SRT (podcasts)

**Files:**
- Create: `src/lyrics/vttParser.ts`
- Test: `src/lyrics/vttParser.test.ts`

**Interfaces:**
- Consumes: `LyricLine` de `src/lyrics/types.ts`.
- Produces: `parseVtt(input: string): LyricLine[]` — accepte WebVTT (`.` décimale, heures optionnelles) et SRT (`,` décimale), balises HTML retirées.

- [ ] **Step 1: Écrire les tests qui échouent**

`src/lyrics/vttParser.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { parseVtt } from './vttParser';

const VTT = `WEBVTT

00:01.000 --> 00:04.000
Bonjour et bienvenue

00:04.500 --> 00:08.000
dans ce <b>podcast</b>
sur les cartes`;

const SRT = `1
00:00:01,000 --> 00:00:04,000
Bonjour et bienvenue

2
00:00:04,500 --> 00:00:08,000
dans ce podcast`;

describe('parseVtt', () => {
  it('parse le WebVTT, fusionne les lignes multiples et retire les balises', () => {
    expect(parseVtt(VTT)).toEqual([
      { start: 1, end: 4, text: 'Bonjour et bienvenue' },
      { start: 4.5, end: 8, text: 'dans ce podcast sur les cartes' },
    ]);
  });

  it('parse le SRT (virgule décimale, heures)', () => {
    expect(parseVtt(SRT)).toEqual([
      { start: 1, end: 4, text: 'Bonjour et bienvenue' },
      { start: 4.5, end: 8, text: 'dans ce podcast' },
    ]);
  });

  it('renvoie [] sur une entrée sans cue', () => {
    expect(parseVtt('WEBVTT\n\nNOTE rien ici')).toEqual([]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/lyrics/vttParser.test.ts`
Expected: FAIL (« Failed to resolve import "./vttParser" »).

- [ ] **Step 3: Implémenter**

`src/lyrics/vttParser.ts` :

```ts
import type { LyricLine } from './types';

const CUE_RE =
  /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/;

function toSeconds(h: string | undefined, m: string, s: string, ms: string): number {
  return (h ? Number(h) * 3600 : 0) + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

/** Parse un transcript WebVTT ou SRT. Les balises HTML des cues sont retirées. */
export function parseVtt(input: string): LyricLine[] {
  const lines = input.split(/\r?\n/);
  const out: LyricLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = CUE_RE.exec(lines[i]);
    if (!m) continue;
    const start = toSeconds(m[1], m[2], m[3], m[4]);
    const end = toSeconds(m[5], m[6], m[7], m[8]);
    const textLines: string[] = [];
    while (i + 1 < lines.length && lines[i + 1].trim() !== '') {
      i++;
      textLines.push(lines[i].trim());
    }
    const text = textLines.join(' ').replace(/<[^>]+>/g, '').trim();
    if (text !== '') out.push({ start, end, text });
  }
  return out;
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run src/lyrics/vttParser.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lyrics/vttParser.ts src/lyrics/vttParser.test.ts
git commit -m "feat: VTT/SRT transcript parser"
```

---

### Task 4: Géométrie du trajet

**Files:**
- Create: `src/route/geometry.ts`
- Test: `src/route/geometry.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces (utilisés par Tasks 5, 6, 9) :
  - `type LngLat = [number, number]`
  - `interface RouteGeometry { coords: LngLat[]; cumulative: number[]; total: number }` (mètres)
  - `buildRouteGeometry(coords: LngLat[]): RouteGeometry`
  - `pointAt(route: RouteGeometry, dist: number): LngLat` (borné à `[0, total]`)
  - `sliceRoute(route: RouteGeometry, from: number, to: number): LngLat[]`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/route/geometry.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { buildRouteGeometry, pointAt, sliceRoute } from './geometry';

// À l'équateur, 1° de longitude ≈ 111 195 m (haversine, R = 6 371 km).
describe('buildRouteGeometry', () => {
  it('calcule les distances cumulées et le total', () => {
    const r = buildRouteGeometry([[0, 0], [1, 0], [2, 0]]);
    expect(r.cumulative[0]).toBe(0);
    expect(r.cumulative[1]).toBeCloseTo(111195, -1);
    expect(r.total).toBeCloseTo(222390, -1);
  });
});

describe('pointAt', () => {
  it("interpole au milieu d'un segment", () => {
    const r = buildRouteGeometry([[0, 0], [1, 0]]);
    expect(pointAt(r, r.total / 2)[0]).toBeCloseTo(0.5, 5);
  });

  it('borne les distances hors trajet aux extrémités', () => {
    const r = buildRouteGeometry([[0, 0], [1, 0]]);
    expect(pointAt(r, -10)).toEqual([0, 0]);
    expect(pointAt(r, r.total + 10)).toEqual([1, 0]);
  });
});

describe('sliceRoute', () => {
  it('découpe entre deux distances en conservant les sommets intermédiaires', () => {
    const r = buildRouteGeometry([[0, 0], [1, 0], [2, 0]]);
    const s = sliceRoute(r, r.total * 0.25, r.total * 0.75);
    expect(s).toHaveLength(3);
    expect(s[0][0]).toBeCloseTo(0.5, 5);
    expect(s[1][0]).toBeCloseTo(1, 5);
    expect(s[2][0]).toBeCloseTo(1.5, 5);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/route/geometry.test.ts`
Expected: FAIL (« Failed to resolve import "./geometry" »).

- [ ] **Step 3: Implémenter**

`src/route/geometry.ts` :

```ts
/** [longitude, latitude], comme GeoJSON. */
export type LngLat = [number, number];

export interface RouteGeometry {
  coords: LngLat[];
  /** Distance cumulée (m) du départ jusqu'à chaque sommet. */
  cumulative: number[];
  /** Longueur totale du trajet (m). */
  total: number;
}

const EARTH_RADIUS_M = 6371000;

function haversine(a: LngLat, b: LngLat): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function buildRouteGeometry(coords: LngLat[]): RouteGeometry {
  const cumulative = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulative.push(cumulative[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  return { coords, cumulative, total: cumulative[cumulative.length - 1] };
}

/** Point situé à `dist` mètres du départ (interpolation linéaire, borné au trajet). */
export function pointAt(route: RouteGeometry, dist: number): LngLat {
  const { coords, cumulative, total } = route;
  const d = Math.min(Math.max(dist, 0), total);
  const i = cumulative.findIndex((c) => c >= d);
  if (i <= 0) return coords[0];
  const segLen = cumulative[i] - cumulative[i - 1];
  const f = segLen === 0 ? 0 : (d - cumulative[i - 1]) / segLen;
  const [x1, y1] = coords[i - 1];
  const [x2, y2] = coords[i];
  return [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f];
}

/** Portion du trajet entre deux distances, extrémités interpolées incluses. */
export function sliceRoute(route: RouteGeometry, from: number, to: number): LngLat[] {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const pts: LngLat[] = [pointAt(route, a)];
  for (let i = 0; i < route.coords.length; i++) {
    if (route.cumulative[i] > a && route.cumulative[i] < b) pts.push(route.coords[i]);
  }
  pts.push(pointAt(route, b));
  return pts;
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run src/route/geometry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/route/
git commit -m "feat: route geometry (cumulative distances, interpolation, slicing)"
```

---

### Task 5: Timeline — mapping temps → distance

**Files:**
- Create: `src/sync/timeline.ts`
- Test: `src/sync/timeline.test.ts`

**Interfaces:**
- Consumes: `LyricLine` (Task 2) ; `RouteGeometry`, `sliceRoute`, `LngLat` (Task 4).
- Produces (utilisés par Tasks 8 et 9) :
  - `interface LyricSegment { id: number; text: string; start: number; end: number; coords: LngLat[] }`
  - `buildSegments(lines: LyricLine[], route: RouteGeometry, duration: number): LyricSegment[]`
  - `distanceAtTime(t: number, duration: number, total: number): number` (borné)
  - `type SegState = 'past' | 'current' | 'future'` et `stateAtTime(seg: LyricSegment, t: number): SegState`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/sync/timeline.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { buildRouteGeometry } from '../route/geometry';
import { buildSegments, distanceAtTime, stateAtTime } from './timeline';

const route = buildRouteGeometry([[0, 0], [2, 0]]);
const lines = [
  { start: 0, end: 10, text: 'première moitié' },
  { start: 10, end: 20, text: 'seconde moitié' },
];

describe('buildSegments', () => {
  it('attribue à chaque ligne le tronçon proportionnel à son intervalle de temps', () => {
    const segs = buildSegments(lines, route, 20);
    expect(segs).toHaveLength(2);
    expect(segs[0].id).toBe(0);
    expect(segs[0].coords[0]).toEqual([0, 0]);
    expect(segs[0].coords[segs[0].coords.length - 1][0]).toBeCloseTo(1, 5);
    expect(segs[1].coords[0][0]).toBeCloseTo(1, 5);
    expect(segs[1].coords[segs[1].coords.length - 1][0]).toBeCloseTo(2, 5);
  });
});

describe('distanceAtTime', () => {
  it('est proportionnelle et bornée', () => {
    expect(distanceAtTime(10, 20, 1000)).toBe(500);
    expect(distanceAtTime(-5, 20, 1000)).toBe(0);
    expect(distanceAtTime(25, 20, 1000)).toBe(1000);
    expect(distanceAtTime(5, 0, 1000)).toBe(0);
  });
});

describe('stateAtTime', () => {
  const seg = { id: 0, text: 'x', start: 10, end: 20, coords: [] };
  it('passé / courant / futur selon t', () => {
    expect(stateAtTime(seg, 5)).toBe('future');
    expect(stateAtTime(seg, 10)).toBe('current');
    expect(stateAtTime(seg, 19.9)).toBe('current');
    expect(stateAtTime(seg, 20)).toBe('past');
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/sync/timeline.test.ts`
Expected: FAIL (« Failed to resolve import "./timeline" »).

- [ ] **Step 3: Implémenter**

`src/sync/timeline.ts` :

```ts
import type { LyricLine } from '../lyrics/types';
import { sliceRoute, type LngLat, type RouteGeometry } from '../route/geometry';

export interface LyricSegment {
  id: number;
  text: string;
  /** Début/fin de la ligne dans l'audio, en secondes. */
  start: number;
  end: number;
  /** Tronçon du trajet « possédé » par cette ligne. */
  coords: LngLat[];
}

/** Projette la durée du morceau sur la longueur du trajet : d(t) = total × t / duration. */
export function distanceAtTime(t: number, duration: number, total: number): number {
  if (duration <= 0) return 0;
  return Math.min(Math.max(t / duration, 0), 1) * total;
}

export function buildSegments(
  lines: LyricLine[],
  route: RouteGeometry,
  duration: number,
): LyricSegment[] {
  return lines.map((line, id) => ({
    id,
    text: line.text,
    start: line.start,
    end: line.end,
    coords: sliceRoute(
      route,
      distanceAtTime(line.start, duration, route.total),
      distanceAtTime(line.end, duration, route.total),
    ),
  }));
}

export type SegState = 'past' | 'current' | 'future';

export function stateAtTime(seg: LyricSegment, t: number): SegState {
  if (t >= seg.end) return 'past';
  if (t >= seg.start) return 'current';
  return 'future';
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run src/sync/timeline.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/sync/
git commit -m "feat: timeline mapping audio time to route distance and lyric segments"
```

---

### Task 6: Routage OSRM + géocodage Nominatim

**Files:**
- Create: `src/route/routing.ts`
- Test: `src/route/routing.test.ts`

**Interfaces:**
- Consumes: `LngLat` (Task 4).
- Produces (utilisés par Task 9) :
  - `type Profile = 'foot' | 'bike' | 'car'`
  - `fetchRoute(start: LngLat, end: LngLat, profile: Profile): Promise<LngLat[]>` — jette `Error('Aucun itinéraire trouvé')` ou `Error('Routage : HTTP <code>')`
  - `geocode(query: string): Promise<{ label: string; lngLat: LngLat }[]>`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/route/routing.test.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRoute, geocode } from './routing';

afterEach(() => vi.unstubAllGlobals());

describe('fetchRoute', () => {
  it('appelle le bon profil OSRM et renvoie les coordonnées GeoJSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [{ geometry: { coordinates: [[2.3, 48.8], [2.4, 48.9]] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const coords = await fetchRoute([2.3, 48.8], [2.4, 48.9], 'foot');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('routing.openstreetmap.de/routed-foot/');
    expect(url).toContain('2.3,48.8;2.4,48.9');
    expect(url).toContain('geometries=geojson');
    expect(coords).toEqual([[2.3, 48.8], [2.4, 48.9]]);
  });

  it("jette une erreur claire quand OSRM ne trouve pas d'itinéraire", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'NoRoute', routes: [] }),
    }));
    await expect(fetchRoute([0, 0], [1, 1], 'car')).rejects.toThrow('Aucun itinéraire trouvé');
  });

  it('jette une erreur sur statut HTTP non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(fetchRoute([0, 0], [1, 1], 'bike')).rejects.toThrow('Routage : HTTP 429');
  });
});

describe('geocode', () => {
  it('interroge Nominatim et convertit lon/lat en nombres', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ display_name: 'Liège, Paris', lon: '2.3268', lat: '48.8797' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    const results = await geocode('métro Liège');
    expect(String(fetchMock.mock.calls[0][0])).toContain('nominatim.openstreetmap.org/search');
    expect(results).toEqual([{ label: 'Liège, Paris', lngLat: [2.3268, 48.8797] }]);
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/route/routing.test.ts`
Expected: FAIL (« Failed to resolve import "./routing" »).

- [ ] **Step 3: Implémenter**

`src/route/routing.ts` :

```ts
import type { LngLat } from './geometry';

export type Profile = 'foot' | 'bike' | 'car';

interface OsrmResponse {
  code: string;
  routes?: { geometry: { coordinates: LngLat[] } }[];
}

/** Itinéraire via les serveurs OSRM publics FOSSGIS (ceux d'openstreetmap.org). */
export async function fetchRoute(start: LngLat, end: LngLat, profile: Profile): Promise<LngLat[]> {
  const pair = `${start[0]},${start[1]};${end[0]},${end[1]}`;
  const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${pair}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routage : HTTP ${res.status}`);
  const data = (await res.json()) as OsrmResponse;
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('Aucun itinéraire trouvé');
  return data.routes[0].geometry.coordinates;
}

interface NominatimResult {
  display_name: string;
  lon: string;
  lat: string;
}

export async function geocode(query: string): Promise<{ label: string; lngLat: LngLat }[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nominatim : HTTP ${res.status}`);
  const data = (await res.json()) as NominatimResult[];
  return data.map((r) => ({ label: r.display_name, lngLat: [Number(r.lon), Number(r.lat)] }));
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run src/route/routing.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/route/routing.ts src/route/routing.test.ts
git commit -m "feat: OSRM routing and Nominatim geocoding clients"
```

---

### Task 7: Client lrclib + métadonnées MP3

**Files:**
- Create: `src/lyrics/lrclib.ts`, `src/lyrics/metadata.ts`
- Test: `src/lyrics/lrclib.test.ts`, `src/lyrics/metadata.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces (utilisés par Task 9) :
  - `searchLyrics(artist: string, title: string, duration?: number): Promise<string | null>` — renvoie le texte LRC brut du meilleur candidat (durée la plus proche), `null` si aucun résultat synchronisé.
  - `readTrackMeta(file: File): Promise<{ artist?: string; title?: string }>` — `{}` si les tags sont illisibles (jamais d'exception).

- [ ] **Step 1: Écrire les tests qui échouent**

`src/lyrics/lrclib.test.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchLyrics } from './lrclib';

afterEach(() => vi.unstubAllGlobals());

describe('searchLyrics', () => {
  it('choisit le candidat synchronisé à la durée la plus proche', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { syncedLyrics: null, duration: 180 },
        { syncedLyrics: '[00:01.00]Loin', duration: 300 },
        { syncedLyrics: '[00:01.00]Proche', duration: 182 },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);
    const lrc = await searchLyrics('Artiste', 'Titre', 180);
    expect(String(fetchMock.mock.calls[0][0])).toContain('lrclib.net/api/search');
    expect(lrc).toBe('[00:01.00]Proche');
  });

  it("renvoie null quand aucun résultat n'a de paroles synchronisées", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ syncedLyrics: null, duration: 100 }],
    }));
    expect(await searchLyrics('A', 'B')).toBeNull();
  });

  it('jette une erreur sur statut HTTP non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(searchLyrics('A', 'B')).rejects.toThrow('lrclib : HTTP 500');
  });
});
```

`src/lyrics/metadata.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { readTrackMeta } from './metadata';

describe('readTrackMeta', () => {
  it('renvoie {} sur un fichier illisible plutôt que de jeter', async () => {
    const junk = new File([new Uint8Array([1, 2, 3, 4])], 'x.mp3', { type: 'audio/mpeg' });
    expect(await readTrackMeta(junk)).toEqual({});
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/lyrics/lrclib.test.ts src/lyrics/metadata.test.ts`
Expected: FAIL (imports non résolus).

- [ ] **Step 3: Implémenter**

`src/lyrics/lrclib.ts` :

```ts
interface LrclibHit {
  syncedLyrics: string | null;
  duration: number;
}

/**
 * Cherche des paroles synchronisées sur lrclib.net.
 * Renvoie le LRC brut du meilleur candidat (durée la plus proche), ou null.
 */
export async function searchLyrics(
  artist: string,
  title: string,
  duration?: number,
): Promise<string | null> {
  const url = new URL('https://lrclib.net/api/search');
  url.searchParams.set('artist_name', artist);
  url.searchParams.set('track_name', title);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lrclib : HTTP ${res.status}`);
  const hits = (await res.json()) as LrclibHit[];
  const synced = hits.filter((h) => h.syncedLyrics);
  if (synced.length === 0) return null;
  if (duration !== undefined) {
    synced.sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
  }
  return synced[0].syncedLyrics;
}
```

`src/lyrics/metadata.ts` :

```ts
import { parseBlob } from 'music-metadata';

/** Lit artiste/titre dans les tags du fichier audio. Jamais d'exception. */
export async function readTrackMeta(file: File): Promise<{ artist?: string; title?: string }> {
  try {
    const meta = await parseBlob(file);
    const out: { artist?: string; title?: string } = {};
    if (meta.common.artist) out.artist = meta.common.artist;
    if (meta.common.title) out.title = meta.common.title;
    return out;
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run src/lyrics/lrclib.test.ts src/lyrics/metadata.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lyrics/lrclib.ts src/lyrics/lrclib.test.ts src/lyrics/metadata.ts src/lyrics/metadata.test.ts
git commit -m "feat: lrclib client and MP3 tag reader"
```

---

### Task 8: Carte MapLibre + couche de paroles

**Files:**
- Create: `src/map/map.ts`, `src/map/lyricLayer.ts`
- Test: `src/map/lyricLayer.test.ts` (uniquement la partie pure `segmentsToGeoJSON` — le rendu WebGL se valide visuellement en Task 10)

**Interfaces:**
- Consumes: `LyricSegment`, `stateAtTime` (Task 5) ; `LngLat` (Task 4).
- Produces (utilisés par Task 9) :
  - `createMap(container: HTMLElement): maplibregl.Map` (style OpenFreeMap Liberty, centre Paris)
  - `followPoint(map: maplibregl.Map, lngLat: LngLat): void`
  - `segmentsToGeoJSON(segments: LyricSegment[]): FeatureCollection`
  - `addLyricLayer(map: maplibregl.Map, segments: LyricSegment[]): void` (idempotent : met à jour la source si elle existe)
  - `clearLyricLayer(map: maplibregl.Map): void`
  - `updateLyricStates(map: maplibregl.Map, segments: LyricSegment[], t: number): void`

- [ ] **Step 1: Écrire le test qui échoue (partie pure)**

`src/map/lyricLayer.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { segmentsToGeoJSON } from './lyricLayer';

describe('segmentsToGeoJSON', () => {
  it('produit une feature LineString par ligne de paroles, id numérique + texte', () => {
    const fc = segmentsToGeoJSON([
      { id: 0, text: 'bonjour', start: 0, end: 5, coords: [[0, 0], [1, 0]] },
      { id: 1, text: 'monde', start: 5, end: 10, coords: [[1, 0], [2, 0]] },
    ]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].id).toBe(0);
    expect(fc.features[0].geometry).toEqual({ type: 'LineString', coordinates: [[0, 0], [1, 0]] });
    expect(fc.features[0].properties).toEqual({ text: 'bonjour' });
    expect(fc.features[1].properties).toEqual({ text: 'monde' });
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

Run: `npx vitest run src/map/lyricLayer.test.ts`
Expected: FAIL (« Failed to resolve import "./lyricLayer" »).

- [ ] **Step 3: Implémenter**

`src/map/map.ts` :

```ts
import maplibregl from 'maplibre-gl';
import type { LngLat } from '../route/geometry';

export function createMap(container: HTMLElement): maplibregl.Map {
  return new maplibregl.Map({
    container,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [2.3488, 48.8534], // Paris
    zoom: 12,
    attributionControl: { compact: true },
  });
}

/** Suivi caméra fluide : petit easeTo linéaire à chaque tick. */
export function followPoint(map: maplibregl.Map, lngLat: LngLat): void {
  map.easeTo({ center: lngLat, duration: 250, easing: (t) => t });
}
```

`src/map/lyricLayer.ts` :

```ts
import type maplibregl from 'maplibre-gl';
import type { FeatureCollection, LineString } from 'geojson';
import { stateAtTime, type LyricSegment } from '../sync/timeline';

const SOURCE_ID = 'lyrics';
const LAYER_ID = 'lyrics-text';

export function segmentsToGeoJSON(segments: LyricSegment[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: segments.map((s) => ({
      type: 'Feature',
      id: s.id,
      geometry: { type: 'LineString', coordinates: s.coords },
      properties: { text: s.text },
    })),
  };
}

/** Ajoute (ou met à jour) la rivière de paroles le long du trajet. */
export function addLyricLayer(map: maplibregl.Map, segments: LyricSegment[]): void {
  const data = segmentsToGeoJSON(segments);
  const existing = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
    return;
  }
  map.addSource(SOURCE_ID, { type: 'geojson', data });
  map.addLayer({
    id: LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'symbol-placement': 'line-center',
      'text-field': ['get', 'text'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 16,
      'text-keep-upright': true,
      'text-allow-overlap': false,
    },
    paint: {
      // past = grisé, current = accent karaoké, future = encre foncée
      'text-color': [
        'match',
        ['coalesce', ['feature-state', 'state'], 'future'],
        'past', '#a8adb5',
        'current', '#e8336d',
        '#1d2b45',
      ],
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
    },
  });
}

export function clearLyricLayer(map: maplibregl.Map): void {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  source?.setData({ type: 'FeatureCollection', features: [] });
}

export function updateLyricStates(
  map: maplibregl.Map,
  segments: LyricSegment[],
  t: number,
): void {
  for (const seg of segments) {
    map.setFeatureState({ source: SOURCE_ID, id: seg.id }, { state: stateAtTime(seg, t) });
  }
}
```

- [ ] **Step 4: Vérifier le passage**

Run: `npx vitest run src/map/lyricLayer.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/map/
git commit -m "feat: MapLibre map and lyric symbol layer with past/current/future states"
```

---

### Task 9: Player audio, contrôles et câblage `main.ts`

**Files:**
- Create: `src/sync/player.ts`, `src/ui/controls.ts`
- Modify: `src/main.ts` (remplacer intégralement le fichier provisoire de la Task 1)

**Interfaces:**
- Consumes: tout ce qui précède (Tasks 2–8), ids DOM de `index.html` (Task 1).
- Produces: app complète. `createPlayer(onTick: (t: number) => void): Player` avec `interface Player { load(file: File): Promise<number>; play(): void; pause(): void; readonly audio: HTMLAudioElement }` (le `Promise<number>` de `load` résout avec la durée en secondes).

Pas de test unitaire ici : `player.ts` et `controls.ts` sont de minces enveloppes DOM (jsdom n'implémente pas `<audio>.play`), `main.ts` du câblage. Validation manuelle complète en Task 10 ; les invariants logiques sont déjà couverts par les Tasks 2–8.

- [ ] **Step 1: Écrire `src/sync/player.ts`**

```ts
export interface Player {
  /** Charge le fichier et résout avec la durée (secondes). */
  load(file: File): Promise<number>;
  play(): void;
  pause(): void;
  readonly audio: HTMLAudioElement;
}

/** Enveloppe <audio> ; onTick(currentTime) est appelé via requestAnimationFrame pendant la lecture. */
export function createPlayer(onTick: (t: number) => void): Player {
  const audio = new Audio();
  let raf = 0;
  const tick = () => {
    onTick(audio.currentTime);
    raf = requestAnimationFrame(tick);
  };
  audio.addEventListener('play', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  });
  audio.addEventListener('pause', () => cancelAnimationFrame(raf));
  audio.addEventListener('ended', () => {
    cancelAnimationFrame(raf);
    onTick(audio.duration);
  });
  return {
    audio,
    load(file) {
      audio.src = URL.createObjectURL(file);
      return new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => resolve(audio.duration);
        audio.onerror = () => reject(new Error('Fichier audio illisible'));
      });
    },
    play: () => void audio.play(),
    pause: () => audio.pause(),
  };
}
```

- [ ] **Step 2: Écrire `src/ui/controls.ts`**

```ts
export interface Controls {
  searchStart: HTMLInputElement;
  searchEnd: HTMLInputElement;
  profile: HTMLSelectElement;
  resetRoute: HTMLButtonElement;
  audioFile: HTMLInputElement;
  artist: HTMLInputElement;
  title: HTMLInputElement;
  fetchLyrics: HTMLButtonElement;
  lyricsFile: HTMLInputElement;
  play: HTMLButtonElement;
  status: HTMLParagraphElement;
}

export function getControls(): Controls {
  const byId = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Élément #${id} introuvable dans index.html`);
    return el as T;
  };
  return {
    searchStart: byId('search-start'),
    searchEnd: byId('search-end'),
    profile: byId('profile'),
    resetRoute: byId('reset-route'),
    audioFile: byId('audio-file'),
    artist: byId('artist'),
    title: byId('title'),
    fetchLyrics: byId('fetch-lyrics'),
    lyricsFile: byId('lyrics-file'),
    play: byId('play'),
    status: byId('status'),
  };
}
```

- [ ] **Step 3: Remplacer `src/main.ts`**

```ts
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import maplibregl from 'maplibre-gl';
import { createMap, followPoint } from './map/map';
import { addLyricLayer, clearLyricLayer, updateLyricStates } from './map/lyricLayer';
import { fetchRoute, geocode, type Profile } from './route/routing';
import { buildRouteGeometry, pointAt, type LngLat, type RouteGeometry } from './route/geometry';
import { parseLrc } from './lyrics/lrcParser';
import { parseVtt } from './lyrics/vttParser';
import { searchLyrics } from './lyrics/lrclib';
import { readTrackMeta } from './lyrics/metadata';
import { buildSegments, distanceAtTime, type LyricSegment } from './sync/timeline';
import { createPlayer } from './sync/player';
import { getControls } from './ui/controls';
import type { LyricLine } from './lyrics/types';

const c = getControls();
const map = createMap(document.getElementById('map')!);

const state: {
  start?: LngLat;
  end?: LngLat;
  route?: RouteGeometry;
  lyrics?: LyricLine[];
  duration?: number;
  segments?: LyricSegment[];
} = {};

const startMarker = new maplibregl.Marker({ color: '#2563eb' });
const endMarker = new maplibregl.Marker({ color: '#e8336d' });
const cursor = new maplibregl.Marker({ color: '#111827', scale: 0.8 });

function status(msg: string): void {
  c.status.textContent = msg;
}

const player = createPlayer((t) => {
  if (!state.route || !state.segments || !state.duration) return;
  const pos = pointAt(state.route, distanceAtTime(t, state.duration, state.route.total));
  cursor.setLngLat(pos);
  followPoint(map, pos);
  updateLyricStates(map, state.segments, t);
});

function tryBuildSegments(): void {
  if (!state.route || !state.lyrics || !state.duration) return;
  state.segments = buildSegments(state.lyrics, state.route, state.duration);
  const add = () => addLyricLayer(map, state.segments!);
  if (map.isStyleLoaded()) add();
  else map.once('load', add);
  cursor.setLngLat(pointAt(state.route, 0)).addTo(map);
  c.play.disabled = false;
  status('Prêt ! Lance le voyage.');
}

async function computeRoute(): Promise<void> {
  if (!state.start || !state.end) return;
  status("Calcul de l'itinéraire…");
  try {
    const coords = await fetchRoute(state.start, state.end, c.profile.value as Profile);
    state.route = buildRouteGeometry(coords);
    const bounds = coords.reduce(
      (b, p) => b.extend(p),
      new maplibregl.LngLatBounds(coords[0], coords[0]),
    );
    map.fitBounds(bounds, { padding: 80 });
    status(`Itinéraire : ${(state.route.total / 1000).toFixed(1)} km.`);
    tryBuildSegments();
  } catch (err) {
    status(`Erreur d'itinéraire : ${(err as Error).message}`);
  }
}

map.on('click', (e) => {
  const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];
  if (!state.start) {
    state.start = lngLat;
    startMarker.setLngLat(lngLat).addTo(map);
    status("Départ posé. Clique l'arrivée.");
  } else if (!state.end) {
    state.end = lngLat;
    endMarker.setLngLat(lngLat).addTo(map);
    void computeRoute();
  }
});

c.resetRoute.addEventListener('click', () => {
  player.pause();
  state.start = state.end = state.route = state.segments = undefined;
  startMarker.remove();
  endMarker.remove();
  cursor.remove();
  clearLyricLayer(map);
  c.play.disabled = true;
  c.play.textContent = '▶ Lancer le voyage';
  status('Clique sur la carte : départ, puis arrivée.');
});

function bindSearch(input: HTMLInputElement, which: 'start' | 'end'): void {
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || input.value.trim() === '') return;
    status("Recherche de l'adresse…");
    try {
      const results = await geocode(input.value);
      if (results.length === 0) {
        status('Adresse introuvable.');
        return;
      }
      const { label, lngLat } = results[0];
      const marker = which === 'start' ? startMarker : endMarker;
      state[which] = lngLat;
      marker.setLngLat(lngLat).addTo(map);
      status(label);
      if (state.start && state.end) void computeRoute();
      else map.flyTo({ center: lngLat, zoom: 14 });
    } catch (err) {
      status(`Erreur Nominatim : ${(err as Error).message}`);
    }
  });
}
bindSearch(c.searchStart, 'start');
bindSearch(c.searchEnd, 'end');

c.audioFile.addEventListener('change', async () => {
  const file = c.audioFile.files?.[0];
  if (!file) return;
  status("Chargement de l'audio…");
  try {
    state.duration = await player.load(file);
  } catch (err) {
    status((err as Error).message);
    return;
  }
  const meta = await readTrackMeta(file);
  if (meta.artist) c.artist.value = meta.artist;
  if (meta.title) c.title.value = meta.title;
  status(`Audio chargé (${Math.round(state.duration)} s).`);
  if (c.artist.value && c.title.value) void fetchLyricsFromLrclib();
  else status('Audio chargé. Renseigne artiste + titre, ou fournis un fichier de paroles.');
});

async function fetchLyricsFromLrclib(): Promise<void> {
  if (!state.duration) {
    status("Charge d'abord le fichier audio.");
    return;
  }
  if (c.artist.value.trim() === '' || c.title.value.trim() === '') {
    status('Renseigne artiste et titre.');
    return;
  }
  status('Recherche des paroles sur lrclib…');
  try {
    const lrc = await searchLyrics(c.artist.value, c.title.value, state.duration);
    if (!lrc) {
      status('Pas de paroles synchronisées trouvées — fournis un fichier .lrc/.vtt.');
      return;
    }
    state.lyrics = parseLrc(lrc, state.duration);
    status(`${state.lyrics.length} lignes de paroles trouvées.`);
    tryBuildSegments();
  } catch (err) {
    status(`Erreur lrclib : ${(err as Error).message}`);
  }
}
c.fetchLyrics.addEventListener('click', () => void fetchLyricsFromLrclib());

c.lyricsFile.addEventListener('change', async () => {
  const file = c.lyricsFile.files?.[0];
  if (!file) return;
  if (!state.duration) {
    status("Charge d'abord le fichier audio.");
    return;
  }
  const text = await file.text();
  state.lyrics = file.name.toLowerCase().endsWith('.lrc')
    ? parseLrc(text, state.duration)
    : parseVtt(text);
  status(`${state.lyrics.length} lignes de paroles chargées.`);
  tryBuildSegments();
});

c.play.addEventListener('click', () => {
  if (player.audio.paused) {
    map.easeTo({ zoom: Math.max(map.getZoom(), 15.5), duration: 800 });
    player.play();
    c.play.textContent = '⏸ Pause';
  } else {
    player.pause();
    c.play.textContent = '▶ Reprendre';
  }
});
```

- [ ] **Step 4: Vérifier typecheck + tests complets**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: 0 erreur TypeScript ; tous les tests des Tasks 2–8 passent toujours.

- [ ] **Step 5: Fumée visuelle rapide**

```bash
npm run dev
```

Ouvrir `http://localhost:5173` : la carte s'affiche (tuiles OpenFreeMap), le panneau aussi, deux clics posent les marqueurs et le statut affiche la distance de l'itinéraire. Arrêter le serveur.

- [ ] **Step 6: Commit**

```bash
git add src/sync/player.ts src/ui/controls.ts src/main.ts
git commit -m "feat: audio player, controls and full app wiring"
```

---

### Task 10: Fichiers de démo + vérification de bout en bout

**Files:**
- Create: `scripts/make-demo-wav.mjs`, `samples/chanson-automne.lrc`, `README.md`

**Interfaces:**
- Consumes: l'app complète (Task 9).
- Produces: `samples/demo.wav` (60 s, généré, non commité), `samples/chanson-automne.lrc` (texte public domain), README.

- [ ] **Step 1: Écrire le générateur de WAV de démo**

`scripts/make-demo-wav.mjs` :

```js
// Génère samples/demo.wav : 60 s de sinusoïde 440 Hz, PCM 16 bits mono 22 050 Hz.
// Permet de tester l'app sans MP3 sous droits.
import { mkdirSync, writeFileSync } from 'node:fs';

const rate = 22050;
const seconds = 60;
const n = rate * seconds;
const data = Buffer.alloc(n * 2);
for (let i = 0; i < n; i++) {
  const v = Math.sin((2 * Math.PI * 440 * i) / rate) * 0.2 * 32767;
  data.writeInt16LE(Math.round(v), i * 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + data.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(rate, 24);
header.writeUInt32LE(rate * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(data.length, 40);
mkdirSync('samples', { recursive: true });
writeFileSync('samples/demo.wav', Buffer.concat([header, data]));
console.log('samples/demo.wav écrit (60 s).');
```

- [ ] **Step 2: Écrire les paroles de démo (domaine public — Verlaine)**

`samples/chanson-automne.lrc` :

```
[ti:Chanson d'automne]
[ar:Paul Verlaine]
[00:02.00]Les sanglots longs
[00:06.00]Des violons
[00:10.00]De l'automne
[00:14.00]Blessent mon cœur
[00:18.00]D'une langueur
[00:22.00]Monotone.
[00:26.00]Tout suffocant
[00:30.00]Et blême, quand
[00:34.00]Sonne l'heure,
[00:38.00]Je me souviens
[00:42.00]Des jours anciens
[00:46.00]Et je pleure ;
[00:50.00]Et je m'en vais
[00:54.00]Au vent mauvais
[00:57.00]Qui m'emporte.
```

- [ ] **Step 3: Générer le WAV et exclure les binaires du dépôt**

```bash
export PATH="/opt/homebrew/bin:$PATH"
node scripts/make-demo-wav.mjs
echo "samples/*.wav" >> .gitignore
```

Expected: `samples/demo.wav écrit (60 s).`

- [ ] **Step 4: Vérification E2E dans le navigateur**

```bash
npm run dev &
```

Avec les outils navigateur (plugin Playwright) sur `http://localhost:5173` :

1. Cliquer deux points sur la carte à ~1 km d'écart dans Paris → le statut affiche « Itinéraire : X km. ».
2. Charger `samples/demo.wav` dans « 2. Musique » → statut « Audio chargé (60 s)… ».
3. Charger `samples/chanson-automne.lrc` dans le champ fichier de paroles → statut « 15 lignes de paroles chargées. » puis « Prêt ! ».
4. Cliquer « ▶ Lancer le voyage » → la caméra zoome et suit le curseur ; les vers de Verlaine sont écrits le long du trajet ; la ligne courante est rose (`#e8336d`), les lignes passées virent au gris.
5. Prendre une capture d'écran de contrôle en cours de lecture.

Critère d'acceptation : les 3 états visuels (passé grisé / courant rose / futur encre) sont observables pendant la lecture, et le curseur atteint l'arrivée à la fin de l'audio.

Problème connu à vérifier (accepté par la spec si présent) : les lignes trop longues pour leur tronçon peuvent être masquées par l'anti-collision de MapLibre.

- [ ] **Step 5: Écrire `README.md`**

```markdown
# Lyric Route

Les paroles de ce que tu écoutes, écrites le long de ton trajet sur la carte.

## Démarrer

    npm install
    npm run dev

## Utilisation

1. **Trajet** — clique un départ et une arrivée sur la carte (ou cherche une adresse),
   choisis le mode (à pied / vélo / voiture).
2. **Musique** — charge un fichier audio. Les paroles synchronisées sont cherchées
   automatiquement sur [lrclib.net](https://lrclib.net) via les tags du fichier ;
   sinon fournis un `.lrc` (musique) ou `.srt`/`.vtt` (podcast).
3. **Lecture** — le voyage démarre : la caméra suit ta position simulée, les paroles
   à venir sont devant toi, la ligne en cours est en surbrillance, les paroles déjà
   chantées restent en grisé derrière toi. Arrivée à destination à la dernière note.

## Démo sans MP3

    node scripts/make-demo-wav.mjs   # génère samples/demo.wav (60 s)

Puis charge `samples/demo.wav` + `samples/chanson-automne.lrc` (Verlaine, domaine public).

## Tests

    npm test         # Vitest (parseurs, géométrie, timeline, clients HTTP mockés)
    npm run typecheck

Spec : `docs/superpowers/specs/2026-07-03-lyric-route-design.md`.
```

- [ ] **Step 6: Vérification finale + commit**

```bash
npx tsc --noEmit
npx vitest run
git add scripts/ samples/chanson-automne.lrc README.md .gitignore
git commit -m "feat: demo files (generated WAV + public-domain LRC) and README"
```

---

## Self-Review (fait à l'écriture du plan)

- **Couverture de la spec** : choix trajet clic + Nominatim (T6, T9) ✓ ; profils foot/bike/car (T6) ✓ ; MP3 local + tags (T7, T9) ✓ ; lrclib + fallback .lrc/.vtt (T7, T2, T3, T9) ✓ ; mapping temps→distance (T5) ✓ ; rendu 3 états le long du trajet, pas de trait bleu (T8) ✓ ; caméra fluide (T8, T9) ✓ ; erreurs réseau/parsing (T6, T7, T9) ✓ ; tests Vitest logique pure (T2–T8) ✓. Hors scope (GPS, MusicKit, GTFS) : absent du plan, conforme.
- **Placeholders** : aucun TBD/TODO ; chaque étape code contient le code complet.
- **Cohérence des types** : `LyricLine {start, end, text}` (T2) utilisé par T3/T5 ; `LyricSegment` (T5) par T8/T9 ; `Player.load → Promise<number>` (T9) cohérent avec l'usage ; noms `addLyricLayer`/`clearLyricLayer`/`updateLyricStates` identiques en T8 et T9.
