# Hygiene + Basemap Layers + UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Purger les 5 minors des revues précédentes, ajouter un sélecteur de fonds de carte (3 styles OpenFreeMap) et restyler l'UI « propre mais fun » (squircles, palette rose/encre, marqueurs custom).

**Architecture:** Volet A : retouches ponctuelles (`main.ts`, `overpass.ts`, `detour.ts`). Volet B : contrôle MapLibre `IControl` custom (`src/map/basemapControl.ts`) + re-pose de la couche paroles sur `style.load` après `map.setStyle()`. Volet C : remplacement complet de `src/style.css` (variables CSS, squircles) + marqueurs `Marker({ element })` custom dans `main.ts`.

**Tech Stack:** TypeScript strict, Vite, Vitest, MapLibre GL, OpenFreeMap. Spec : `docs/superpowers/specs/2026-07-05-hygiene-layers-ux-design.md`.

## Global Constraints

- Vérification : `npm run typecheck` + `npm test`. **ESLint n'est pas configuré** — ne pas prétendre l'avoir lancé.
- Textes UI en anglais ; commentaires de code en français.
- Pas de nouvelle dépendance ; pas de fichier de test pour les modules DOM/carte (`main.ts`, `basemapControl.ts`) — la logique testable vit dans `overpass.ts`/`detour.ts`.
- Palette : primaire `#e8336d`, encre `#111827`, hints `#6b7280`, ambre offre `#b45309`.
- Commit trailer : `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Détour — Overpass équilibré (A4) + fit penalty (A5)

**Files:**
- Modify: `src/route/overpass.ts`
- Modify: `src/route/overpass.test.ts`
- Modify: `src/route/detour.ts`
- Modify: `src/route/detour.test.ts`

**Interfaces:**
- Consumes: `buildPoiQuery(b: Bbox): string`, `fetchPois(bbox): Promise<Poi[]>`, `selectWaypoints(pois, ctx)` existants — signatures inchangées.
- Produces: rien de nouveau (comportements internes corrigés).

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `src/route/overpass.test.ts`, compléter le describe `buildPoiQuery` :

```ts
  it('budget réparti : un out center 16 par famille (pas d\'union tronquée nodes-d\'abord)', () => {
    const q = buildPoiQuery(bbox);
    expect(q.match(/out center 16;/g)).toHaveLength(5);
    expect(q).not.toContain('out center 80');
  });
```

Dans le describe `fetchPois`, ajouter `type` + `id` aux éléments du mock existant (`type: 'node', id: 1`, `id: 2`… valeurs distinctes ; le way garde `type: 'way'`) — les assertions du test existant ne changent pas — et ajouter :

```ts
  it('dédoublonne par type/id (un élément peut matcher deux familles de sélecteurs)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          { type: 'way', id: 7, center: { lat: 48.85, lon: 2.36 }, tags: { leisure: 'park', historic: 'yes', name: 'Parc historique' } },
          { type: 'way', id: 7, center: { lat: 48.85, lon: 2.36 }, tags: { leisure: 'park', historic: 'yes', name: 'Parc historique' } },
          { type: 'node', id: 7, lat: 48.8, lon: 2.3, tags: { amenity: 'cafe' } }, // même id, autre type : conservé
        ],
      }),
    }));
    const pois = await fetchPois(bbox);
    expect(pois).toHaveLength(2);
    expect(pois[0].category).toBe('monument'); // historic prime sur park
  });
```

Dans `src/route/detour.test.ts`, ajouter au describe `selectWaypoints` :

```ts
  it('à attrait égal, préfère le candidat qui fait atterrir le plus près de la cible', () => {
    // nearTarget : trajet ≈ 2 899 m ; overshoot : ≈ 3 249 m. Cible 3 000 (cap 3 300 : les
    // deux passent). L'ancien bonus de rallonge brute choisissait le plus long.
    const nearTarget = poi([0.01, 0.0084], 'monument');
    const overshoot = poi([0.01, 0.0107], 'monument');
    const sel = selectWaypoints([nearTarget, overshoot], ctx(3000));
    expect(sel.waypoints).toEqual([nearTarget]);
  });
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `npx vitest run src/route/overpass.test.ts src/route/detour.test.ts`
Expected: FAIL — `out center 16` absent (requête union actuelle), doublon non filtré (3 POI au lieu de 2), et `overshoot` sélectionné à la place de `nearTarget` (bonus de rallonge).

- [ ] **Step 3: Implémenter**

`src/route/overpass.ts` :

```ts
interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}
```

```ts
/** Requête Overpass QL : 5 familles de POI, chacune avec son propre `out center 16`
 *  (budget total 80). Une union unique + `out center 80` tronquerait nodes-d'abord :
 *  en zone dense, les cafés (nodes) évinceraient parcs et plans d'eau (ways/relations). */
export function buildPoiQuery(b: Bbox): string {
  const bb = `(${b.south},${b.west},${b.north},${b.east})`;
  const selectors = [
    'nwr["tourism"~"^(attraction|viewpoint|artwork)$"]',
    'nwr["historic"]',
    'nwr["leisure"~"^(park|garden)$"]',
    'nwr["natural"="water"]',
    'nwr["amenity"~"^(cafe|theatre|arts_centre)$"]',
  ];
  return `[out:json][timeout:25];${selectors.map((s) => `${s}${bb};out center 16;`).join('')}`;
}
```

Dans `fetchPois`, un élément peut désormais sortir deux fois (deux familles) — dédoublonner :

```ts
  const pois: Poi[] = [];
  const seen = new Set<string>();
  for (const el of data.elements ?? []) {
    if (el.id !== undefined) {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat === undefined || lon === undefined || !el.tags) continue;
    const category = categorize(el.tags);
    if (!category) continue;
    pois.push({ name: el.tags.name, lngLat: [lon, lat], category });
  }
  return pois;
```

`src/route/detour.ts` — remplacer la constante et le score :

```ts
// À score d'attrait égal, on préfère le candidat qui fait atterrir le plus près de la cible.
const FIT_PENALTY_PER_KM = 5;
```

et dans la boucle de `selectWaypoints` :

```ts
      const score =
        scorePoi(poi, keywords, hints) - (Math.abs(target - len) / 1000) * FIT_PENALTY_PER_KM;
```

(`FIT_BONUS_PER_KM` disparaît ; grep pour vérifier qu'il n'a pas d'autre référence.)

- [ ] **Step 4: Vérifier**

Run: `npm run typecheck && npm test`
Expected: PASS — 87 existants + 2 nouveaux ; les tests `selectWaypoints` existants restent verts (géométries symétriques → pénalités égales).

Run: `grep -rn "FIT_BONUS_PER_KM" src`
Expected: aucune occurrence.

- [ ] **Step 5: Commit**

```bash
git add src/route/overpass.ts src/route/overpass.test.ts src/route/detour.ts src/route/detour.test.ts
git commit -m "fix: balanced Overpass budget per POI family, detour fit penalty targets closeness"
```

---

### Task 2: Hygiène `main.ts` (A1-A3)

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: l'existant (`playTrack`, `computeRoute`, `startJourney`, `updateOffers`, `needsDetour`, `averageSpeed`).
- Produces: rien de nouveau.

- [ ] **Step 1: A1 — statut de skip posté après la reprise**

Dans le catch du `player.load()` de `playTrack`, remplacer :

```ts
    } catch (err) {
      if (epoch !== journeyEpoch) return;
      // Piste illisible en plein voyage : on saute sa fenêtre au lieu de bloquer le
      // voyage en pause (Resume ré-échouerait et la piste fautive est verrouillée).
      status(`${(err as Error).message} — skipping “${trackLabel(track)}”.`);
      continueJourneyAt(track.start + track.duration);
      return;
    }
```

par :

```ts
    } catch (err) {
      if (epoch !== journeyEpoch) return;
      // Piste illisible en plein voyage : on saute sa fenêtre au lieu de bloquer le
      // voyage. Statut posté APRÈS la reprise : si elle débouche sur le silence ou
      // l'arrivée, leur message ne doit pas masquer l'explication du skip.
      continueJourneyAt(track.start + track.duration);
      status(`${(err as Error).message} — skipped “${trackLabel(track)}”.`);
      return;
    }
```

- [ ] **Step 2: A2 — phase `arrived` vs nouvelle route / replay**

Dans `computeRoute`, juste après `fitRoute();` :

```ts
    if (phase === 'arrived') {
      // Nouvelle route après une arrivée : ce n'est pas un replay — on repart à zéro,
      // et rebuildSegments ne doit plus poser le curseur à destination.
      phase = 'idle';
      c.play.textContent = '▶ Start the journey';
    }
```

Dans `startJourney`, juste après `journeyEpoch++;` :

```ts
  phase = 'idle'; // quitte 'arrived' AVANT rebuildSegments : curseur au départ, pas de flash à destination
```

- [ ] **Step 3: A3 — `updateOffers` sans lecture de `c.detour.hidden`**

Remplacer `updateOffers` :

```ts
/** Unique propriétaire de la ligne d'offre persistante : détour prioritaire, sinon
 *  couverture insuffisante ; vidée dès que rien ne s'applique. */
function updateOffers(): void {
  updateDetourOffer();
  const music = playlist.totalMusic();
  let offer = '';
  if (state.route && music > 0) {
    const speed = averageSpeed(state.route, c.profile.value as Profile);
    if (!state.detourPois && needsDetour(state.route.total, music, speed)) {
      const extra = music - travelSeconds();
      offer = `The music outlasts the trip by ~${formatDuration(Math.max(60, extra))} — add a scenic detour?`;
    } else if (music < travelSeconds() * 0.8) {
      offer = `Your playlist covers ${formatDuration(music)} of a ~${formatDuration(travelSeconds())} trip — drop more songs anytime.`;
    }
  }
  c.offer.textContent = offer;
  c.offer.hidden = offer === '';
}
```

(Le corps de `updateDetourOffer` ne change pas ; seul le couplage disparaît.)

- [ ] **Step 4: Vérifier et committer**

Run: `npm run typecheck && npm test`
Expected: PASS.

Run: `grep -n "c.detour.hidden" src/main.ts`
Expected: occurrences uniquement dans `clearDetour`, `updateDetourOffer` et `applyDetour` — plus aucune dans `updateOffers`.

```bash
git add src/main.ts
git commit -m "fix: skip status survives phase messages, arrived-phase route/replay resets, decoupled offers"
```

---

### Task 3: Sélecteur de fonds de carte

**Files:**
- Create: `src/map/basemapControl.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `maplibregl.IControl`, `addLyricLayer`/`updateLyricStates` existants.
- Produces: `BASEMAPS: { label: string; url: string }[]` et `class BasemapControl implements maplibregl.IControl` avec `constructor(onChange: (url: string) => void)` ; classes CSS `basemap-ctrl`, `basemap-ctrl-toggle`, `basemap-ctrl-list` (stylées en Task 4).

- [ ] **Step 1: Create `src/map/basemapControl.ts`**

```ts
import type maplibregl from 'maplibre-gl';

export interface Basemap {
  label: string;
  url: string;
}

/** Fonds OpenFreeMap (gratuits, sans clé) ; le premier est le défaut de createMap. */
export const BASEMAPS: Basemap[] = [
  { label: 'Liberty', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { label: 'Bright', url: 'https://tiles.openfreemap.org/styles/bright' },
  { label: 'Positron', url: 'https://tiles.openfreemap.org/styles/positron' },
];

/** Contrôle « fonds de carte » façon openstreetmap.org : un bouton qui déplie la liste. */
export class BasemapControl implements maplibregl.IControl {
  private container!: HTMLDivElement;
  private current = BASEMAPS[0].url;

  constructor(private onChange: (url: string) => void) {}

  onAdd(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'maplibregl-ctrl basemap-ctrl';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'basemap-ctrl-toggle';
    toggle.title = 'Change the basemap';
    toggle.textContent = '⧉';
    const list = document.createElement('div');
    list.className = 'basemap-ctrl-list';
    list.hidden = true;
    for (const b of BASEMAPS) {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'basemap';
      radio.checked = b.url === this.current;
      radio.addEventListener('change', () => {
        if (this.current === b.url) return;
        this.current = b.url;
        this.onChange(b.url);
        list.hidden = true;
      });
      label.append(radio, document.createTextNode(` ${b.label}`));
      list.append(label);
    }
    toggle.addEventListener('click', () => {
      list.hidden = !list.hidden;
    });
    this.container.append(toggle, list);
    return this.container;
  }

  onRemove(): void {
    this.container.remove();
  }
}
```

- [ ] **Step 2: Câbler dans `src/main.ts`**

Import :

```ts
import { BasemapControl } from './map/basemapControl';
```

Juste après le listener `map.on('zoomstart', …)` (toutes les variables capturées sont déclarées plus haut) :

```ts
// Sélecteur de fonds : setStyle() efface les couches custom. Handler PERSISTANT
// (pas de `once` empilé à chaque bascule) : à chaque chargement de style, on re-pose
// les paroles et on resynchronise leur état passé/courant/futur. Au premier
// chargement de la carte, state.words est vide → no-op.
map.on('style.load', () => {
  if (state.words) {
    addLyricLayer(map, state.words);
    updateLyricStates(map, state.words, journeyT);
  }
});
map.addControl(new BasemapControl((url) => map.setStyle(url)), 'top-right');
```

- [ ] **Step 3: Vérifier et committer**

Run: `npm run typecheck && npm test`
Expected: PASS (aucun test ne couvre ces modules DOM ; le smoke Task 5 valide le comportement).

```bash
git add src/map/basemapControl.ts src/main.ts
git commit -m "feat: basemap switcher (Liberty/Bright/Positron) with lyric layer re-add"
```

---

### Task 4: Restyle UX — panneau + marqueurs custom

**Files:**
- Modify: `src/main.ts` (marqueurs uniquement)
- Modify: `src/style.css` (remplacement complet)

**Interfaces:**
- Consumes: classes CSS `basemap-ctrl*` (Task 3).
- Produces: classes `marker-pin`/`marker-start`/`marker-end`, `journey-cursor`.

- [ ] **Step 1: Marqueurs custom dans `src/main.ts`**

Remplacer les trois constructions de marqueurs :

```ts
const startMarker = new maplibregl.Marker({ color: '#2563eb' });
const endMarker = new maplibregl.Marker({ color: '#e8336d' });
const cursor = new maplibregl.Marker({ color: '#111827', scale: 0.8 });
```

par :

```ts
/** Élément DOM d'un marqueur custom (stylé par style.css). */
function markerElement(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}
const startMarker = new maplibregl.Marker({ element: markerElement('marker-pin marker-start'), anchor: 'bottom' });
const endMarker = new maplibregl.Marker({ element: markerElement('marker-pin marker-end'), anchor: 'bottom' });
// Le « joueur » : pastille encre à anneau blanc, pulse discret (voir .journey-cursor).
const cursor = new maplibregl.Marker({ element: markerElement('journey-cursor'), anchor: 'center' });
```

(Aucun autre usage ne change : `setLngLat/addTo/remove` sont identiques ; les marqueurs des POI de détour — ambre, standard — restent tels quels.)

- [ ] **Step 2: Remplacer intégralement `src/style.css` par :**

```css
:root {
  --ink: #111827;
  --primary: #e8336d;
  --primary-dark: #c22458;
  --primary-soft: #fdf2f6;
  --hint: #6b7280;
  --line: #d1d5db;
  --amber: #b45309;
  --radius-panel: 20px;
  --radius: 13px;
}

html, body { height: 100%; margin: 0; font-family: system-ui, sans-serif; color: var(--ink); }
#map { position: absolute; inset: 0; }

#panel {
  position: absolute; top: 12px; left: 12px; z-index: 10; width: 300px;
  background: rgba(255, 255, 255, 0.94); border-radius: var(--radius-panel); padding: 16px;
  box-shadow: 0 8px 28px rgba(17, 24, 39, 0.16);
  max-height: calc(100% - 24px); overflow-y: auto; box-sizing: border-box;
  backdrop-filter: blur(6px);
}
#panel h1 { font-size: 19px; margin: 0 0 8px; letter-spacing: -0.02em; }
#panel h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--hint); margin: 18px 0 6px; }

#panel input, #panel select, #panel button {
  width: 100%; box-sizing: border-box; margin: 4px 0; padding: 8px 12px; font: inherit;
  border-radius: var(--radius); border: 1.5px solid var(--line); background: #fff; color: var(--ink);
}
#panel input:focus-visible, #panel select:focus-visible {
  outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(232, 51, 109, 0.18);
}
#panel button {
  cursor: pointer; font-weight: 600;
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.05s;
}
#panel button:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
#panel button:active:not(:disabled) { transform: scale(0.985); }
#panel button:disabled { cursor: default; opacity: 0.45; }

/* L'action principale : le seul bouton plein. */
#panel #play { background: var(--primary); border-color: var(--primary); color: #fff; font-size: 15px; padding: 10px 12px; }
#panel #play:hover:not(:disabled) { background: var(--primary-dark); border-color: var(--primary-dark); color: #fff; }

.hint { font-size: 12px; color: var(--hint); }
#offer { color: var(--amber); font-weight: 600; }

#dropzone {
  border: 2px dashed #c8ccd4; border-radius: var(--radius); padding: 16px 10px;
  text-align: center; cursor: pointer; margin: 6px 0; background: #fafafa; font-size: 13px;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}
#dropzone:hover, #dropzone:focus-visible, #dropzone.drag {
  border-color: var(--primary); background: var(--primary-soft); transform: rotate(-0.6deg) scale(1.01);
}

#drop-overlay {
  position: fixed; inset: 10px; z-index: 100; display: flex;
  align-items: center; justify-content: center;
  background: rgba(232, 51, 109, 0.12); border: 4px dashed var(--primary); border-radius: 24px;
  box-sizing: border-box; font-size: 26px; font-weight: 700; color: var(--primary);
  pointer-events: none; /* laisse le drop atteindre la fenêtre */
}
#drop-overlay[hidden] { display: none; }

#playlist { list-style: none; margin: 6px 0; padding: 0; font-size: 13px; }
#playlist li {
  display: flex; align-items: center; gap: 6px; padding: 6px 8px;
  border-radius: var(--radius); cursor: pointer; border: 1.5px solid transparent;
}
#playlist li:hover { background: #f6f7f9; }
#playlist li.selected { background: var(--primary-soft); border-color: var(--primary); }
#playlist li.locked { color: #9ca3af; }
#playlist li .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#playlist li button {
  width: auto; margin: 0; padding: 1px 7px; font-size: 12px; line-height: 1.5;
  background: none; border: 1.5px solid var(--line); border-radius: 9px;
}
#playlist li button:disabled { opacity: 0.3; }
#panel #clear-playlist {
  background: none; border: none; color: var(--hint); font-size: 12px;
  text-decoration: underline; width: auto; padding: 0; font-weight: 400;
}

/* Marqueurs custom : départ (bleu), arrivée (rose) — goutte CSS classique. */
.marker-pin { width: 28px; height: 28px; position: relative; }
.marker-pin::before {
  content: ''; position: absolute; inset: 0;
  border-radius: 50% 50% 50% 0; transform: rotate(-45deg);
  box-shadow: 0 2px 6px rgba(17, 24, 39, 0.35);
}
.marker-pin::after {
  content: ''; position: absolute; top: 7px; left: 7px; width: 14px; height: 14px;
  border-radius: 50%; background: #ffffff;
}
.marker-start::before { background: #2563eb; }
.marker-end::before { background: var(--primary); }

/* Le « joueur » : pastille encre à anneau blanc, pulse rose discret. */
.journey-cursor {
  position: relative; width: 18px; height: 18px; border-radius: 50%;
  background: var(--ink); border: 3px solid #fff;
  box-shadow: 0 0 0 2px rgba(17, 24, 39, 0.25), 0 2px 6px rgba(17, 24, 39, 0.35);
}
.journey-cursor::after {
  content: ''; position: absolute; inset: -3px; border-radius: 50%;
  border: 2px solid rgba(232, 51, 109, 0.55);
  animation: cursor-pulse 2s ease-out infinite;
}
@keyframes cursor-pulse {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(2.1); opacity: 0; }
}

/* Contrôle « fonds de carte » (Task 3), même langage que le panneau. */
.basemap-ctrl {
  background: rgba(255, 255, 255, 0.95); border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15); overflow: hidden;
}
.basemap-ctrl-toggle {
  display: block; width: 34px; height: 34px; border: none; background: none;
  font-size: 17px; cursor: pointer; color: var(--ink);
}
.basemap-ctrl-toggle:hover { color: var(--primary); }
.basemap-ctrl-list { padding: 6px 10px 8px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ink); }
.basemap-ctrl-list label { display: flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; }
```

Notes de spécificité : `#panel #play` et `#panel #clear-playlist` (2 ids) battent `#panel button` (1 id + 1 élément) — ne pas « simplifier » en `#play` seul, il perdrait.

- [ ] **Step 3: Vérifier et committer**

Run: `npm run typecheck && npm test`
Expected: PASS.

```bash
git add src/main.ts src/style.css
git commit -m "feat: playful squircle UI, custom journey cursor and route markers"
```

---

### Task 5: Vérification navigateur complète

**Files:** aucune création ; corrections triviales uniquement (au-delà : rapporter).

- [ ] **Step 1: Suite**

Run: `npm run typecheck && npm test`
Expected: PASS (89 tests : 87 + 2 de la Task 1).

- [ ] **Step 2: Smoke test (Playwright)**

`npm run dev` + assets scratchpad habituels (2 WAV silencieux + un `.lrc`). Scénarios :

1. **Bascule des fonds pendant la lecture** : route à pied moyenne + 1 piste avec paroles ; lancer la lecture ; ouvrir le contrôle ⧉ (haut-droite) et basculer Liberty → Bright → Positron pendant que ça joue. Attendu à chaque bascule : le fond change, **les paroles restent visibles** (couche re-posée) avec leurs états (mots passés grisés), le curseur et les marqueurs restent en place, la lecture continue. Screenshot sur chacun des 3 fonds.
2. **Rendu UI** : screenshot du panneau complet (playlist remplie, offre visible) — vérifier visuellement : coins arrondis partout, bouton Play rose plein, ligne d'offre ambre, dropzone au survol (focus dropzone pour l'état). Vérifier que les marqueurs départ/arrivée (gouttes bleu/rose) et le curseur (pastille + pulse) apparaissent sur la carte.
3. **A2 en pratique** : petite route, arriver (`Arrived!`), puis chercher une NOUVELLE destination plus lointaine → statut `Route: …`, bouton `▶ Start the journey` (pas Replay), curseur au départ du nouveau trajet (pas à sa destination).
4. **Offre découplée (A3)** : vérifier que la ligne d'offre apparaît/bascule comme avant (couverture ↔ dépassement) après ajouts/retraits de pistes.

Les correctifs A1 (ordre du statut de skip), A4/A5 (Overpass/fit) sont couverts par lecture de code + tests unitaires — le noter dans le rapport.

Rapporter PASS/FAIL par scénario, textes exacts observés, erreurs console. Tuer le serveur dev.

- [ ] **Step 3: État final**

Run: `git status`
Expected: arbre propre.
