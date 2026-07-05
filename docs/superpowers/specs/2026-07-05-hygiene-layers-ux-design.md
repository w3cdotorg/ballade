# Hygiène + fonds de carte + revue UX — Design

Date : 2026-07-05
Statut : validé (brainstorming avec Clément)
Origine : minors différés des revues « playlist » et « status polish » + deux
demandes de Clément (sélecteur de fonds façon openstreetmap.org, UI « propre
mais fun »).

## Volet A — Hygiène (5 correctifs)

### A1. Statut de skip visible

Dans le catch du `player.load()` de `playTrack`, poster le statut **après**
`continueJourneyAt(track.start + track.duration)` et au passé :
`« Unreadable audio file — skipped “<label>”. »`. Si le skip débouche sur une
piste, rien ne l'écrase ; s'il débouche sur le silence ou l'arrivée, le
message de skip a le dernier mot (l'explication prime, la phase reste lisible
via le libellé du bouton). La garde d'epoch reste en tête du catch.

### A2. Phase `arrived` vs nouvelle route / replay

- `computeRoute` (succès) : si `phase === 'arrived'` → `phase = 'idle'` et
  `c.play.textContent = '▶ Start the journey'` (une nouvelle route n'est pas
  un replay ; le curseur ne se pose plus à la destination d'un trajet jamais
  parcouru, la branche `arrived` de `rebuildSegments` ne s'appliquant plus).
- `startJourney` : `phase = 'idle';` juste après `journeyEpoch++;`, avant
  `rebuildSegments()` — supprime le flash du curseur à destination au replay.

### A3. `updateOffers` sans dépendance d'ordre

Le message d'offre détour est conditionné par un recalcul direct :
`!state.detourPois && needsDetour(state.route.total, music, speed)` (avec
`speed = averageSpeed(...)`), au lieu de lire `c.detour.hidden`.
`updateDetourOffer` ne gère plus que la visibilité du bouton.

### A4. Overpass équilibré par catégorie

`buildPoiQuery` émet 5 requêtes séquentielles dans le même appel (une par
famille de sélecteurs), chacune suivie de son propre `out center 16` — même
budget total (80) que l'union actuelle, mais garanti par famille (l'union +
`out center 80` tronque nodes-d'abord : les cafés évincent parcs/eau en zone
dense). Un élément qui matche deux familles peut sortir en double →
`fetchPois` dédoublonne par `type/id` (champs ajoutés à `OverpassElement`).

### A5. Fit penalty au lieu de fit bonus

Dans `selectWaypoints`, remplacer le bonus `+ ((len - curLen)/1000) ×
FIT_BONUS_PER_KM` (récompense la rallonge brute, contredit son commentaire)
par une pénalité d'écart à la cible :
`- (Math.abs(target - len)/1000) × FIT_PENALTY_PER_KM` (constante renommée,
même valeur 5). À attrait égal, gagne le candidat qui fait atterrir le trajet
le plus près de la cible. Le test « à géométrie égale » reste valide ; un
nouveau test départage deux candidats de même catégorie par proximité à la
cible.

## Volet B — Sélecteur de fonds de carte

- **3 styles OpenFreeMap** (gratuits, sans clé, fournisseur actuel) :
  - Liberty — `https://tiles.openfreemap.org/styles/liberty` (défaut actuel)
  - Bright — `https://tiles.openfreemap.org/styles/bright`
  - Positron — `https://tiles.openfreemap.org/styles/positron`
- **Contrôle custom MapLibre** (`IControl`), nouveau module
  `src/map/basemapControl.ts`, ajouté en `top-right` : un bouton (⧉) qui
  déplie une petite liste radio des 3 fonds ; libellés anglais (Liberty /
  Bright / Positron) ; stylé selon le volet C.
- **Re-pose des couches** : `map.setStyle(url)` efface les couches custom.
  Le contrôle expose un callback `onStyleChange` ; `main.ts` s'y branche et,
  sur l'événement `style.load` du nouveau fond, re-pose la couche de paroles
  (`addLyricLayer(map, state.words)` si présentes) puis re-synchronise l'état
  (`updateLyricStates(map, state.words, journeyT)`). Les marqueurs (DOM)
  survivent d'eux-mêmes.
- Pas de persistance du choix entre sessions (hors périmètre).

## Volet C — Revue UX « propre mais fun » (panneau + carte)

- **Panneau** (`src/style.css`) : squircles — rayons doux (panneau 20 px,
  boutons/inputs/dropzone/lignes de liste 12-14 px) ; palette harmonisée :
  primaire rose `#e8336d`, encre `#111827`, gris hints `#6b7280`, ambre offre
  `#b45309` ; **bouton Play en primaire plein** (fond rose, texte blanc,
  hover plus foncé, disabled délavé) ; boutons secondaires (reset, detour,
  fetch) en style « outline » arrondi ; inputs avec focus ring rose ;
  dropzone arrondie plus joueuse au survol (déjà rose — accentuer le fond) ;
  lignes de playlist arrondies avec sélection rose pâle (existant, harmonisé).
- **Carte** : curseur custom — `Marker({ element })` avec une pastille encre
  à anneau blanc et pulse CSS discret (le « joueur ») ; marqueurs départ
  (bleu `#2563eb`) / arrivée (rose `#e8336d`) custom aux formes cohérentes
  (goutte/pin arrondi CSS) ; le contrôle layers du volet B reprend le même
  langage (fond blanc translucide, squircle, ombre douce).
- Textes UI inchangés (anglais) ; aucune dépendance (pas de fonte externe —
  hors périmètre, comme les animations au-delà du pulse).

## Vérification

- `npx tsc --noEmit` + suite Vitest (les volets A4/A5 sont testés en pur ;
  B/C sont DOM, convention non testée).
- Smoke navigateur : bascule des 3 fonds pendant qu'une chanson joue (paroles
  re-posées, curseur/état intacts), rendu du panneau et des marqueurs
  (screenshots sur les 3 fonds), scénario skip/statuts du volet A si
  praticable, offre détour toujours fonctionnelle (A3), sélection de détour
  plus proche de la cible (A5, via tests unitaires).
- ESLint non configuré.

## Hors périmètre

Persistance du fond choisi, fond sombre (Carto), fonte externe, animations
au-delà du pulse du curseur, refonte du drag-and-drop.
