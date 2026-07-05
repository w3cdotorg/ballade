# Vitesse de curseur constante et réaliste — Design (Spec 1)

Date : 2026-07-04
Statut : validé (brainstorming avec Clément)

## Problème

Aujourd'hui le curseur projette la durée de la chanson sur la longueur totale du
trajet (`distanceAtTime` : `d = total × t / durée`). Sa vitesse vaut donc
`distance ÷ durée de chanson` : réaliste sur un trajet de quartier, absurde sur
Paris–Lorient (~2 000 km/h pour une chanson de 4 min). La vitesse de déplacement
doit être constante et plausible quelle que soit la distance.

## Décisions (issues du brainstorming)

1. **Vitesse constante réaliste**, dérivée de la **durée estimée OSRM** du
   trajet : `v = route.total / route.duration`. Pas de constante magique ; un
   trajet autoroutier roule à l'allure autoroute, un trajet piéton à l'allure
   de marche.
2. **Chanson finie avant l'arrivée** → le curseur **continue en silence à la
   même vitesse** jusqu'à destination. Aucune accélération (choix assumé :
   Paris–Lorient à pied représente des jours simulés).
3. **Arrivée avant la fin de la chanson** → la chanson en cours joue jusqu'au
   bout, curseur immobile à destination. Le remède en amont reste l'**offre de
   détour**, recalculée sur la durée OSRM.
4. Une **Spec 2 « playlist »** suivra : plusieurs fichiers audio joués bout à
   bout pour remplir les longs trajets, paroles par piste, offre « ajouter des
   chansons », détour calé sur la durée totale de la playlist. Hors périmètre
   ici, mais l'architecture (horloge de voyage) est choisie pour l'accueillir.

## Comportement

- Le curseur avance à `v` constant du départ à l'arrivée.
- Les paroles occupent le tronçon parcouru **pendant** la chanson : les
  premiers `v × durée_chanson` mètres (clampés à la longueur totale), plus tout
  le trajet.
- Après la fin de la chanson (trajet plus long) : phase silencieuse, même
  vitesse, statut honnête du type « Musique terminée — le voyage continue
  (~2 j 4 h restants à pied) ». Pause/reprise fonctionnent aussi dans cette
  phase.
- Le statut du calcul de route affiche distance **et** durée estimée
  (« Route : 5,2 km · ~1 h 06 »).

## Architecture

### `route/routing.ts`

`fetchRoute` retourne `{ coords, duration }` (secondes, champ `duration` de la
réponse OSRM, aujourd'hui ignoré). `buildRouteGeometry` prend la durée et
`RouteGeometry` gagne un champ `duration`.

### `sync/journeyClock.ts` (nouveau)

Le **temps de voyage `T`** devient la référence unique du rendu (curseur,
caméra, états des paroles) :

- Pendant la lecture audio : `T = audio.currentTime` (zéro dérive ; pause,
  seek et fin de piste sont gérés par l'audio).
- Après `audio.ended` : un rAF fait avancer `T` (temps réel écoulé) jusqu'à
  `T ≥ route.duration` (arrivée) ou pause.
- API : `start()`, `pause()`, `stop()` (reset), callback `onTick(T)`.
- La Spec 2 généralisera : piste k active → `T = T_k + audio.currentTime`.

### `sync/timeline.ts`

La projection temps→distance devient `d(T) = min(v × T, total)` avec
`v = total / duration` porté par `RouteGeometry`. `buildSegments` découpe les
tronçons de paroles avec cette projection. Signature : `distanceAtTime(t,
speedMps, total)` — la vitesse est passée explicitement pour que le fallback
`SPEED_MPS[profile]` (qui exige le profil) reste au call site.

### `route/detour.ts`

`needsDetour` et `targetLength` utilisent la vitesse moyenne OSRM du trajet
courant au lieu de `SPEED_MPS[profile]`. `SPEED_MPS` est conservé comme
fallback si la durée OSRM est absente ou nulle.

### `src/main.ts`

Branche l'horloge de voyage : le rAF du player ne pilote plus le curseur
directement, `onTick(T)` de l'horloge s'en charge. Fin de voyage : arrêt de
l'horloge, libellé du bouton play, statut « Arrivé ! ».

## Erreurs & bords

- Durée OSRM absente ou ≤ 0 → `v = SPEED_MPS[profile]` (fallback).
- Reset pendant la phase silencieuse → arrêt de l'horloge (`cancel()`), temps de
  voyage remis à zéro.
- Nouvelle route ou changement de profil pendant la phase silencieuse → la
  phase est recalée (`resyncSilentPhase`) : elle repart du temps courant avec
  la nouvelle vitesse/durée.
- Changement de profil → nouvelle requête OSRM (déjà le cas), nouvelle durée.
- Seek audio pendant la phase silencieuse : impossible (l'audio est terminé) ;
  rejouer (`play` après `ended`) remet `T = 0`, comportement actuel conservé.

## Tests

- `timeline.test.ts` : nouvelle projection (vitesse constante, clamp à
  l'arrivée, paroles sur le tronçon initial).
- `journeyClock` : transition audio→silence, pause/reprise en phase
  silencieuse, arrêt à l'arrivée.
- `detour.test.ts` : seuils recalculés sur la durée OSRM + fallback
  `SPEED_MPS`.
- `routing.test.ts` : parsing du champ `duration`.
- Vérification finale : `npx tsc --noEmit`, `npx eslint . --quiet`, suite
  Vitest complète.

## Hors périmètre (Spec 2 — playlist)

Multi-fichiers (sélection + drag-drop), file de pistes sur l'horloge de
voyage, récupération des paroles par piste, offre « ajouter des chansons »
quand la playlist est plus courte que le voyage, détour sur la durée totale de
la playlist, arrivée au milieu d'une piste → la piste finit, les suivantes ne
jouent pas.
