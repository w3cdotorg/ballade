# Playlist — Design (Spec 2)

Date : 2026-07-05
Statut : validé (brainstorming avec Clément)
Prérequis : Spec 1 « vitesse constante » livrée
(docs/superpowers/specs/2026-07-04-constant-cursor-speed-design.md).

## Problème

À vitesse constante réaliste, une chanson ne couvre qu'une fraction d'un long
trajet : le reste du voyage est silencieux. On veut remplir le voyage avec
plusieurs chansons jouées bout à bout — y compris en ajouter en cours de
route quand le silence s'installe.

## Décisions (issues du brainstorming)

1. **Ajout en cours de voyage** : la piste ajoutée démarre à l'instant
   courant du voyage si on est en silence ; si de la musique est déjà prévue,
   elle se met en file après. Jamais de départ « dans le passé ».
2. **UI** : liste visible des pistes (`n° Titre — durée — statut paroles —
   ↑↓ ×`) avec réordonnancement par ↑↓ des pistes futures ; pistes jouées et
   piste en cours verrouillées (ni retrait ni réordonnancement) ; lien
   « Clear playlist ».
3. **Architecture** : module pur `src/playlist/playlist.ts` (état + maths des
   fenêtres, testé unitairement) + vue DOM `src/ui/playlistView.ts` ;
   `main.ts` orchestre avec une **machine à états de voyage explicite**
   (recommandation de la revue finale Spec 1).
4. Décisions héritées de la Spec 1 : arrivée au milieu d'une piste → la
   piste finit, les suivantes ne jouent pas ; playlist épuisée → phase
   silencieuse existante ; détour calé sur la durée totale de la playlist.

## Comportement

- La zone de dépôt et l'input fichier acceptent **plusieurs fichiers
  audio** ; chaque fichier devient une piste.
- **Paroles par piste** : à l'ajout, lecture des tags puis recherche lrclib
  automatique (statut par piste : `…` recherche, `✓` trouvées, `✗`
  introuvables). Cliquer une piste la **sélectionne** (défaut : la dernière
  ajoutée) ; les champs Artist/Title, « Find lyrics (lrclib) », l'offset et
  le dépôt d'un `.lrc/.vtt` s'appliquent à la piste sélectionnée.
- **Une piste sans paroles se joue quand même** (musique + curseur, tronçon
  sans mots). Changement par rapport à la Spec 1 : Play requiert désormais
  route + ≥ 1 piste (les paroles ne conditionnent plus l'activation).
- **Fin de la playlist avant l'arrivée** → phase silencieuse, statut du type
  `Your playlist covers 12 min of a ~1 h 06 trip — drop more songs anytime.`
- **Arrivée avant la fin** → la piste en cours va au bout (curseur immobile
  à destination), puis fin du voyage ; les pistes suivantes ne jouent pas.
- **Replay** → toutes les pistes se re-calent bout à bout depuis 0 (les
  silences vécus sont oubliés), lecture depuis la piste 1.
- **Détour** : `needsDetour` et l'offre utilisent la durée totale de musique
  de la playlist au lieu de la durée d'un fichier unique.
- Statut de chargement par piste (durée, tags) conservé, en anglais.

## Architecture

### `src/playlist/playlist.ts` (nouveau, module pur)

Une piste :

```ts
interface Track {
  id: number;
  file: File;
  duration: number;           // s
  artist?: string;
  title?: string;
  lyrics?: LyricLine[];       // temps relatifs à la piste
  lyricsStatus: 'searching' | 'found' | 'notfound';
  offset: number;             // décalage paroles (s), par piste
  start: number;              // fenêtre [start, start + duration) en temps de voyage
}
```

Opérations (zéro DOM, zéro audio) :

- `add(file, duration, meta, nowT)` : `start = max(nowT, fin de la dernière
  piste)` — bout à bout avant le départ (`nowT = 0`), « maintenant » en
  silence.
- `remove(id, nowT)` / `moveUp(id, nowT)` / `moveDown(id, nowT)` : refusés
  sur une piste verrouillée ; re-calage bout à bout des pistes futures après
  l'ancrage `max(nowT, fin de la dernière piste non-future)`. Les trous du
  passé (silences vécus) sont conservés ; l'avenir est toujours contigu.
- `clear()` ; `repackFromZero()` (replay).
- Requêtes : `trackAt(T)` (fenêtre contenant T, sinon undefined),
  `endOfMusic()`, `totalMusic()`, `isLocked(id, T)` (piste passée ou en
  cours), `select(id)`/`selected()`.

### Machine à états de voyage (`main.ts`)

`phase: 'idle' | 'playing' | 'paused' | 'silent' | 'silentPaused' |
'arrived'` remplace l'état implicite `silentJourney`/`journeyT`/
`audio.ended` de la Spec 1. Transitions :

- `idle` + Play → `T = 0` ; piste en fenêtre → `playing`, sinon → `silent`.
- `playing`, fin de piste → piste suivante contiguë → `playing` ; sinon
  `silent` (via `journeyClock` existant) ou `arrived` si
  `T ≥ travelSeconds`.
- `silent`, ajout d'une piste → `playing` (elle démarre à `T`).
- Bouton Play = pause/reprise de la phase courante
  (`playing ↔ paused`, `silent ↔ silentPaused`).
- `arrived` + Play → replay : `repackFromZero()`, `T = 0`, piste 1.
- Reset route → l'horloge s'arrête, `T = 0`, la playlist est conservée mais
  re-calée depuis zéro (`repackFromZero()`) — sinon un ajout fait en cours de
  voyage garderait son ancrage passé et créerait un trou au prochain départ.

Pendant `playing`, `T = piste.start + audio.currentTime` (zéro dérive,
pause/fin gérées par l'audio, comme en Spec 1). Pendant `silent`,
`journeyClock` inchangé. `renderAt(T)` reste l'unique point de rendu.

Le player actuel (`src/sync/player.ts`) reste une enveloppe
une-piste-à-la-fois : `load(file)` au moment où la fenêtre d'une piste
commence, puis `play()`.

### Paroles & timeline

Pas de refonte de `timeline.ts` : `tryBuildSegments` concatène les lignes de
toutes les pistes qui en ont, décalées de `track.start + track.offset`, en un
seul tableau absolu (`shiftLyrics` existant), puis `buildSegments(lines,
route, speed)` inchangé. Une piste sans paroles = un tronçon sans mots.
L'input « Lyrics offset » global devient l'offset de la piste sélectionnée.

### `src/ui/playlistView.ts` (nouveau, vue)

Rendu de la liste (ordre, titre ou nom de fichier, durée, statut paroles,
sélection, verrouillage) + callbacks (`onSelect`, `onRemove`, `onMoveUp`,
`onMoveDown`, `onClear`). Aucune logique métier ; non testée (convention du
repo pour le DOM), toute la logique vit dans `playlist.ts`.

### `index.html` / `controls.ts`

`<input id="audio-file" multiple>`, conteneur `<ul id="playlist">`, lien
« Clear playlist », libellé de la dropzone au pluriel (« Drop audio
files »). Les champs Artist/Title/offset existants sont réutilisés, liés à
la piste sélectionnée.

## Erreurs & bords

- Fichier audio illisible → statut d'erreur, piste non ajoutée.
- lrclib sans résultat ou en erreur → statut `✗` sur la piste, corrigeable
  (sélection + champs + « Find lyrics », ou dépôt d'un `.lrc`).
- `.lrc/.vtt` déposé alors que la playlist est vide → statut doux « Load an
  audio file first. » (comportement actuel conservé).
- Ajout de pistes sans route → autorisé ; Play reste désactivé tant que
  route absente ou playlist vide.
- Changement de profil/route pendant le voyage → la vitesse et
  `travelSeconds` changent, les fenêtres (en temps de voyage) ne bougent
  pas ; le recalage silencieux de la Spec 1 (`resyncSilentPhase`) s'applique.
- Drop de plusieurs fichiers dont certains invalides → les valides sont
  ajoutés, chaque invalide est signalé.
- Suppression de la dernière piste future pendant `playing` → la lecture en
  cours n'est pas interrompue ; à sa fin, `silent` ou `arrived`.

## Tests

- `playlist.test.ts` : calage à l'ajout (avant départ, en silence, pendant
  lecture), re-pack après retrait/réordonnancement, refus sur piste
  verrouillée, `trackAt` avec trous historiques, `repackFromZero`,
  `endOfMusic`/`totalMusic`.
- `timeline.test.ts` : segments issus de lignes multi-pistes décalées, piste
  sans paroles = trou sans mots.
- `journeyClock`/`player` : inchangés, tests existants.
- Vérification finale : `npx tsc --noEmit` + suite Vitest + smoke test
  navigateur (playlist courte sur long trajet → silence → ajout live →
  reprise musicale ; réordonnancement ; arrivée mi-piste ; replay).
  ESLint non configuré dans ce repo.

## Hors périmètre

Crossfade/gapless parfait entre pistes (une latence de chargement ~100 ms
est acceptée), drag-and-drop de réordonnancement (↑↓ suffisent),
persistance de la playlist entre sessions, skip/seek dans une piste.
