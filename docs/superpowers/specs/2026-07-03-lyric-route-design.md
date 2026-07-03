# Lyric Route — Design

**Date** : 2026-07-03
**Statut** : validé (design approuvé en conversation)

## Concept

Une app web qui transforme un trajet sur une carte en « rivière de paroles » : le tracé
bleu habituel d'un itinéraire est remplacé par les paroles de la musique (ou le
transcript du podcast) qu'on écoute, écrites le long du chemin. La position sur le
trajet est synchronisée avec la position dans le morceau : les paroles à venir sont
devant soi, la ligne en cours est en surbrillance (karaoké), les paroles déjà chantées
restent derrière soi, en grisé.

Usage : expérience personnelle / projet créatif. Pas un produit, pas de robustesse
industrielle exigée.

## Décisions actées

| Sujet | Décision |
|---|---|
| Moteur carte | MapLibre GL JS + tuiles vectorielles OSM (OpenFreeMap en premier choix, sans clé) |
| Audio | Fichier MP3 local (drag & drop) joué dans le navigateur. MusicKit/Apple Music : envisagé plus tard, hors scope ici |
| Paroles | Récupération automatique sur lrclib.net à partir des métadonnées du MP3 ; fallback fichier `.lrc` ou `.srt`/`.vtt` fourni manuellement (podcasts) |
| Portée du texte | Paroles **uniquement le long du trajet**. Les rues environnantes gardent leurs vrais noms |
| Mouvement | Simulation d'abord (la caméra avance toute seule au rythme du morceau). Mode GPS réel : phase ultérieure, hors scope de cette spec |
| Itinéraire | Serveur public OSRM, profils à pied / vélo / voiture. Métro/transports en commun : hors scope (nécessite GTFS) |
| Backend | Aucun. App 100 % statique (Vite + TypeScript) |

## Architecture

```
src/
  main.ts               // bootstrap, câblage des modules
  map/
    map.ts              // init MapLibre, style OSM, caméra
    lyricLayer.ts       // couches symbol (texte le long du trajet) + états visuels
  route/
    routing.ts          // appels OSRM + Nominatim (recherche d'adresse)
    geometry.ts         // longueur du trajet, découpe en tronçons, interpolation
  lyrics/
    lrcParser.ts        // parse .lrc → [{time, text}]
    vttParser.ts        // parse .srt/.vtt → [{start, end, text}]
    lrclib.ts           // client API lrclib.net (recherche par artiste/titre/durée)
    metadata.ts         // lecture des tags ID3 du MP3 (artiste, titre, durée)
  sync/
    timeline.ts         // LE cœur : mapping temps audio → distance sur le trajet
    player.ts           // <audio>, play/pause/seek, émission du temps courant
  ui/
    controls.ts         // choix trajet, drop MP3, transport, lecture
```

### Flux de données

1. L'utilisateur choisit départ/arrivée (clic carte ou recherche Nominatim) et un
   profil (à pied/vélo/voiture) → `routing.ts` renvoie une polyline GeoJSON.
2. L'utilisateur dépose un MP3 → `metadata.ts` lit les tags → `lrclib.ts` cherche les
   paroles synchronisées ; sinon l'utilisateur fournit un `.lrc`/`.vtt`.
3. `timeline.ts` projette la durée du morceau sur la longueur du trajet :
   chaque ligne de paroles `[tᵢ, tᵢ₊₁]` possède le tronçon `[d(tᵢ), d(tᵢ₊₁)]` où
   `d(t) = longueur_totale × t / durée`. La « vitesse » de déplacement découle de ce
   mapping (arrivée à destination à la dernière note).
4. `lyricLayer.ts` crée une feature LineString par ligne de paroles (géométrie = son
   tronçon, propriété `text` = la ligne) et les affiche via une couche `symbol` avec
   `symbol-placement: line`. Le trait bleu d'itinéraire n'est pas affiché.
5. Pendant la lecture, `player.ts` émet `currentTime` → `timeline.ts` calcule la
   position courante → la caméra suit en douceur, et chaque feature reçoit son état :
   **à venir** (couleur pleine), **en cours** (surbrillance/halo), **passée** (grisé).

### Rendu — détails

- Trois états pilotés par `setFeatureState` (pas de re-création des couches) :
  passé = gris clair, courant = couleur accent + halo, futur = couleur foncée.
- Texte lisible aux zooms élevés (≥ 15) ; en dessous, MapLibre déclutter
  naturellement (c'est accepté : l'expérience se vit zoomé, comme convenu).
- Caméra : suivi fluide du curseur de position (interpolation entre frames,
  `map.jumpTo`/`easeTo` pilotés par requestAnimationFrame), pitch/bearing optionnels.
- Si une ligne de paroles est trop longue pour son tronçon, MapLibre la masque
  (comportement collision par défaut) : accepté pour la v1, on verra à l'usage
  (piste : répéter/tronquer, ou `text-size` adaptatif).

## Gestion des erreurs

- OSRM/Nominatim injoignable → message clair, réessayer.
- lrclib sans résultat → inviter à fournir un `.lrc`/`.vtt` manuellement.
- `.lrc` mal formé → lignes invalides ignorées, avertissement console.
- MP3 sans tags ID3 → champs artiste/titre saisissables à la main avant la
  recherche lrclib.
- Trajet plus court que la chanson (ou l'inverse) : non-problème par construction,
  le mapping proportionnel absorbe tout.

## Tests

- **Vitest** sur la logique pure : `lrcParser`, `vttParser`, `geometry`
  (longueur/interpolation le long d'une polyline), `timeline` (mapping temps→distance,
  bornes : t=0, t=durée, lignes vides, timestamps désordonnés).
- Le rendu carte (MapLibre) se valide visuellement avec un morceau de référence —
  pas de tests automatisés du rendu WebGL.

## Hors scope (phases ultérieures)

- Suggestion de détours par des points d'intérêt (fontaine, parc…) quand la chanson
  est plus longue que le trajet — pour « remplir » la durée avec du chemin agréable
  plutôt que d'étirer le mapping (demande utilisateur du 2026-07-03). Piste : POI via
  Overpass API (OSM), waypoints intermédiaires dans l'appel OSRM.
- Mode GPS réel (`watchPosition`, projection de la position sur le trajet).
- Lecture via Apple Music / MusicKit JS.
- Itinéraires en transports en commun (GTFS).
- Remplacement des noms des rues environnantes.
