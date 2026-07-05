# Status Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligne d'offre persistante (détour/couverture non écrasables), résumé de dépôt multiple, curseur laissé à destination après l'arrivée, piste illisible sautée en plein voyage.

**Architecture:** Un `<p id="offer">` dédié sous le statut, alimenté exclusivement par `updateOffers()` (vidé quand rien ne s'applique) ; `addAudioFile` rapporte `'added' | 'skipped'` aux boucles d'ajout qui posent un résumé quand ≥ 2 fichiers sont traités ; deux retouches ponctuelles dans `rebuildSegments` et le catch de chargement de `playTrack`.

**Tech Stack:** TypeScript strict, Vite, Vitest. Spec : `docs/superpowers/specs/2026-07-05-status-polish-design.md`.

## Global Constraints

- Vérification : `npm run typecheck` + `npm test` (87 tests, inchangés). **ESLint n'est pas configuré** — ne pas prétendre l'avoir lancé.
- Textes UI en anglais ; commentaires de code en français.
- Pas de nouvelle dépendance ; pas de fichier de test pour les modules DOM (convention).
- Commit trailer : `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Implémentation des quatre correctifs

**Files:**
- Modify: `index.html`
- Modify: `src/ui/controls.ts`
- Modify: `src/style.css`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: tout l'existant (`playlist`, `phase`, `journeyEpoch`, `travelSeconds`, `formatDuration`, `trackLabel`, `continueJourneyAt`).
- Produces: contrôle `offer: HTMLParagraphElement` (`#offer`) ; `addAudioFile(file): Promise<'added' | 'skipped'>` ; helper `summarizeBatch(added: number, skipped: string[]): void`.

- [ ] **Step 1: Surfaces — `index.html`, `controls.ts`, `style.css`**

`index.html` — juste après la ligne `<p id="status" class="hint">Click the map: start, then destination.</p>` :

```html
        <p id="offer" class="hint" hidden></p>
```

`src/ui/controls.ts` — dans l'interface `Controls`, après `status: HTMLParagraphElement;` :

```ts
  offer: HTMLParagraphElement;
```

et dans le retour de `getControls()`, après `status: byId('status'),` :

```ts
    offer: byId('offer'),
```

`src/style.css` — en fin de fichier :

```css
#offer { color: #b45309; } /* ambre : distingue l'offre persistante du statut courant */
```

- [ ] **Step 2: `src/main.ts` — ligne d'offre persistante**

Remplacer `updateDetourOffer` et `updateOffers` (lignes ~496-522) par :

```ts
// Le bouton n'apparaît que si la musique dépasse nettement la durée estimée du trajet.
function updateDetourOffer(): void {
  if (state.detourPois) return; // détour appliqué : le bouton affiche déjà « Remove »
  const music = playlist.totalMusic();
  if (!state.route || music === 0) {
    c.detour.hidden = true;
    return;
  }
  const speed = averageSpeed(state.route, c.profile.value as Profile);
  c.detour.hidden = !needsDetour(state.route.total, music, speed);
}

/** Unique propriétaire de la ligne d'offre persistante : détour prioritaire, sinon
 *  couverture insuffisante ; vidée dès que rien ne s'applique. */
function updateOffers(): void {
  updateDetourOffer();
  const music = playlist.totalMusic();
  let offer = '';
  if (state.route && music > 0) {
    if (!state.detourPois && !c.detour.hidden) {
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

Deux appels à ajouter pour que la ligne suive l'état :
- dans le bloc succès d'`applyDetour`, juste avant `resyncSilentPhase();` (l'offre détour doit disparaître/basculer une fois le détour appliqué) :

```ts
    updateOffers();
```

- dans le listener `c.resetRoute`, juste après `refreshPlaylistView();` (plus de route → plus d'offre) :

```ts
  updateOffers();
```

- [ ] **Step 3: `src/main.ts` — résumé de dépôt multiple**

`addAudioFile` rapporte son issue. Signature et retours :

```ts
async function addAudioFile(file: File): Promise<'added' | 'skipped'> {
```

Dans le catch de `probeDuration` : remplacer `return;` par `return 'skipped';`. En toute fin de fonction (après le bloc if/else lrclib), ajouter :

```ts
  return 'added';
```

Helper, à placer juste après `addAudioFile` :

```ts
/** Statut récapitulatif d'un ajout multiple ; un fichier audio seul garde ses statuts détaillés. */
function summarizeBatch(added: number, skipped: string[]): void {
  if (added + skipped.length < 2) return;
  const skippedPart =
    skipped.length > 0 ? ` · ${skipped.length} skipped: ${skipped.join(', ')}` : '';
  status(`${added} track${added === 1 ? '' : 's'} added${skippedPart}`);
}
```

(Raffinement volontaire vs la spec « plus d'un fichier » : le seuil est ≥ 2 fichiers *audio ou inconnus* — un couple audio + .lrc garde ses statuts détaillés, plus utiles que « 1 track added ».)

Listener `c.audioFile` `change` — remplacer le corps :

```ts
c.audioFile.addEventListener('change', () => {
  const files = [...(c.audioFile.files ?? [])];
  void (async () => {
    let added = 0;
    const skipped: string[] = [];
    for (const file of files) {
      if ((await addAudioFile(file)) === 'added') added++;
      else skipped.push(file.name);
    }
    summarizeBatch(added, skipped);
  })();
});
```

Handler `window` `drop` — remplacer la boucle du IIFE :

```ts
  void (async () => {
    let added = 0;
    const skipped: string[] = [];
    for (const file of files) {
      switch (classifyFile(file.name, file.type)) {
        case 'lyrics':
          await loadLyricsFile(file);
          break;
        case 'audio':
          if ((await addAudioFile(file)) === 'added') added++;
          else skipped.push(file.name);
          break;
        default:
          status(`Unsupported file: ${file.name}`);
          skipped.push(file.name);
      }
    }
    summarizeBatch(added, skipped);
  })();
```

- [ ] **Step 4: `src/main.ts` — curseur post-arrivée**

Dans `rebuildSegments`, remplacer :

```ts
  const d = distanceAtTime(journeyT, speed, state.route.total);
```

par :

```ts
  // Après l'arrivée, le curseur reste à destination : journeyT a été remis à zéro
  // pour le prochain départ, mais visuellement le voyage est fini.
  const d =
    phase === 'arrived' ? state.route.total : distanceAtTime(journeyT, speed, state.route.total);
```

- [ ] **Step 5: `src/main.ts` — piste illisible sautée**

Dans `playTrack`, remplacer le catch du `player.load` :

```ts
    } catch (err) {
      if (epoch !== journeyEpoch) return;
      status((err as Error).message);
      phase = 'paused';
      c.play.textContent = '▶ Resume';
      return;
    }
```

par :

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

(La borne de fin étant exclue de `trackAt`, pas de re-boucle sur la même piste ; des échecs en cascade convergent vers le silence ou l'arrivée.)

- [ ] **Step 6: `src/main.ts` — commentaires hérités en français**

Trois commentaires anglais restants, à traduire :

1. Le bloc au-dessus de `let zoomFloorArmed = true;` :

```ts
// Plancher de zoom : tant qu'il est armé, la caméra suiveuse force TRAVEL_ZOOM à chaque
// tick pour converger vers la vue niveau rue. Tout geste de zoom réel (molette/pincement/
// double-clic) le désarme pour respecter le dézoom manuel ; réarmé au départ du voyage / reset.
```

2. Dans le listener `zoomstart` :

```ts
  // originalEvent présent = geste utilisateur ; absent = notre propre animation easeTo.
```

3. Dans `rebuildSegments` :

```ts
  // 'idle' (et non 'load') en secours : isStyleLoaded() peut renvoyer un faux négatif
  // transitoire après le chargement de la carte, auquel cas 'load' ne se redéclencherait jamais.
```

- [ ] **Step 7: Vérifier**

Run: `npm run typecheck && npm test`
Expected: PASS — 87 tests inchangés, 0 erreur TS.

Balayages :

Run: `grep -n "outlasts the trip\|playlist covers" src/main.ts`
Expected: chaque message une seule fois, tous deux dans `updateOffers`.

Run: `grep -n "user gesture\|Zoom floor\|not 'load'" src/main.ts`
Expected: aucune occurrence (les trois commentaires anglais ont disparu).

- [ ] **Step 8: Commit**

```bash
git add index.html src/ui/controls.ts src/style.css src/main.ts
git commit -m "fix: persistent offer line, multi-drop summary, arrival cursor, skip unreadable track"
```

---

### Task 2: Vérification navigateur ciblée

**Files:** aucune création ; corrections triviales uniquement (au-delà : rapporter).

- [ ] **Step 1: Suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 2: Smoke test (Playwright)**

`npm run dev` + assets scratchpad (WAVs silencieux ~20 s/15 s, un faux `bad.mp3` de quelques octets de bruit non-audio, un `.lrc`). Scénarios :

1. **Résumé multi-drop + offre intacte** : route à pied moyenne, déposer d'un coup 2 WAV + `bad.mp3` → statut final `2 tracks added · 1 skipped: bad.mp3`, ligne `#offer` visible en dessous (`Your playlist covers … — drop more songs anytime.`) et non écrasée par les statuts suivants.
2. **Cycle de l'offre** : ajouter assez de musique pour dépasser le trajet ×1,2 → `#offer` bascule sur `The music outlasts the trip by ~… — add a scenic detour?` et le bouton détour apparaît ; retirer des pistes → l'offre bascule ou disparaît.
3. **Curseur post-arrivée** : petite route, arriver (`Arrived!`), puis toucher l'offset ou retirer une piste → le curseur RESTE à destination (vérifier ses coordonnées avant/après via browser_evaluate).
4. **Piste illisible sautée** : ce chemin n'est PAS déclenchable avec de vrais fichiers (un fichier corrompu échoue déjà au `probeDuration` à l'ajout et n'entre jamais dans la playlist — c'est aussi pour ça que le cas est quasi inatteignable). Vérification attendue : relire le catch de `playTrack` dans le code livré (skip + `continueJourneyAt(track.start + track.duration)` + garde d'epoch) et confirmer dans le rapport « vérifié par lecture de code » — ne PAS monter de monkey-patch fragile pour le forcer.

Rapporter PASS/FAIL par scénario + erreurs console. Tuer le serveur dev.

- [ ] **Step 3: État final**

Run: `git status`
Expected: arbre propre.
