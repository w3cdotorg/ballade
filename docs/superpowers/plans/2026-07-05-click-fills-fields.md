# Click Fills Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un clic carte remplit le champ Start (1er clic) ou Destination (2e clic) avec `lat, lng`, et Reset route vide les deux champs.

**Architecture:** Trois retouches dans `src/main.ts` : helper `fmtLngLat`, deux affectations dans le handler `map.on('click')` existant (qui gère déjà le flux mixte via `!state.start`/`!state.end`), deux vidages dans le listener reset.

**Tech Stack:** TypeScript strict, Vite. Spec : `docs/superpowers/specs/2026-07-05-click-fills-fields-design.md`.

## Global Constraints

- Vérification : `npm run typecheck` + `npm test` (90 tests, inchangés — main.ts non testé, convention). **ESLint non configuré.**
- Textes UI anglais ; commentaires français. Pas de nouvelle dépendance.
- Format exact : `` `${p[1].toFixed(5)}, ${p[0].toFixed(5)}` `` (lat, lng — ordre humain).
- Commit trailer : `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Implémentation `main.ts`

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `c.searchStart`/`c.searchEnd` (`Controls`), type `LngLat`.
- Produces: helper local `fmtLngLat(p: LngLat): string`.

- [ ] **Step 1: Helper + remplissage au clic**

Remplacer le handler existant :

```ts
map.on('click', (e) => {
  const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];
  if (!state.start) {
    state.start = lngLat;
    startMarker.setLngLat(lngLat).addTo(map);
    status('Start set. Click the destination.');
  } else if (!state.end) {
    state.end = lngLat;
    endMarker.setLngLat(lngLat).addTo(map);
    void computeRoute();
  }
});
```

par :

```ts
/** Coordonnées lisibles « lat, lng » (ordre humain, inverse du LngLat GeoJSON). */
function fmtLngLat(p: LngLat): string {
  return `${p[1].toFixed(5)}, ${p[0].toFixed(5)}`;
}

// Le clic remplit aussi le champ correspondant : l'interface reflète le geste, et le
// flux mixte est gratuit — une adresse tapée occupe son créneau (state.start/end),
// le clic suivant ne remplit que l'autre champ.
map.on('click', (e) => {
  const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];
  if (!state.start) {
    state.start = lngLat;
    startMarker.setLngLat(lngLat).addTo(map);
    c.searchStart.value = fmtLngLat(lngLat);
    status('Start set. Click the destination.');
  } else if (!state.end) {
    state.end = lngLat;
    endMarker.setLngLat(lngLat).addTo(map);
    c.searchEnd.value = fmtLngLat(lngLat);
    void computeRoute();
  }
});
```

- [ ] **Step 2: Reset vide les champs**

Dans le listener `c.resetRoute`, juste après `c.play.textContent = '▶ Start the journey';`, insérer :

```ts
  // Les champs suivent l'état : après reset il n'y a plus ni marqueurs ni route.
  c.searchStart.value = '';
  c.searchEnd.value = '';
```

- [ ] **Step 3: Vérifier et committer**

Run: `npm run typecheck && npm test`
Expected: PASS (90 tests).

```bash
git add src/main.ts
git commit -m "feat: map clicks fill the Start/Destination fields, reset clears them"
```

---

### Task 2: Vérification navigateur

**Files:** aucune ; corrections triviales uniquement.

- [ ] **Step 1: Suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 2: Smoke test (Playwright)**

`npm run dev` (attention : URL `http://localhost:5173/ballade/`, base Vite). Les clics carte peuvent être simulés par MouseEvent synthétiques sur `.maplibregl-canvas` (mousedown/mouseup/click aux mêmes coordonnées). Scénarios :

1. **Clic-clic** : deux clics à des endroits distincts → champ Start = `lat, lng` du 1er point (5 décimales), champ Destination = celui du 2e, statut `Route: … km · ~…` (route calculée).
2. **Flux mixte** : Reset ; taper « Mairie du 18e, Paris » dans Start + Enter (géocodage, marqueur posé) ; UN clic carte → seul le champ Destination se remplit en coordonnées, le champ Start garde l'adresse tapée, route calculée.
3. **Reset** : cliquer Reset route → les deux champs sont vides, statut `Click the map: start, then destination.`
4. **Saisie post-clic** : après le scénario 1, retaper une adresse dans Start + Enter → le marqueur de départ se déplace et la route se recalcule (comportement existant préservé).

Rapporter PASS/FAIL + valeurs exactes des champs observées + erreurs console. Tuer le serveur dev.

- [ ] **Step 3: État final**

Run: `git status`
Expected: arbre propre.
