# Clic carte → remplissage des champs Start/Destination — Design

Date : 2026-07-05
Statut : validé (brainstorming avec Clément)

## Problème

Cliquer la carte pose les marqueurs et calcule la route, mais les champs
Start/Destination restent vides — l'interface semble déconnectée du geste.

## Comportement

1. **Premier clic** carte → marqueur départ (existant) + champ `#search-start`
   rempli avec `lat, lng` à 5 décimales (ex. `48.89123, 2.34017`).
2. **Deuxième clic** → marqueur arrivée + champ `#search-end` rempli pareil +
   calcul de route (existant).
3. **Flux mixte** : le handler teste déjà `!state.start` puis `!state.end` —
   une adresse tapée à la main (Enter) occupe son créneau, le clic suivant ne
   remplit que l'autre champ. La saisie manuelle reste pleinement
   fonctionnelle (taper + Enter écrase la valeur cliquée, comportement
   existant inchangé).
4. **Reset route vide les deux champs** (changement : aujourd'hui ils
   survivent au reset) — pas de coordonnées orphelines.

## Implémentation

`src/main.ts` uniquement :
- Helper `fmtLngLat(p: LngLat): string` → `` `${p[1].toFixed(5)}, ${p[0].toFixed(5)}` ``
  (ordre lat, lng — l'ordre humain, inverse du LngLat GeoJSON).
- Handler `map.on('click')` : `c.searchStart.value = fmtLngLat(lngLat);` au
  premier clic ; `c.searchEnd.value = fmtLngLat(lngLat);` au second.
- Listener `c.resetRoute` : `c.searchStart.value = ''; c.searchEnd.value = '';`.

## Hors périmètre

Géocodage inverse (Nominatim `/reverse`) pour afficher une adresse lisible —
follow-up possible ; lat,lng brut demandé explicitement.

## Vérification

`npx tsc --noEmit` + suite Vitest (main.ts non testé, convention) + smoke
navigateur : clic-clic → champs remplis + route ; adresse tapée puis clic →
seul Destination se remplit ; Reset → champs vides. ESLint non configuré.
