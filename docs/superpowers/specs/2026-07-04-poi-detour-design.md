# POI detour when the song is longer than the route — Design

*Ballade — 2026-07-04. Status: approved.*

## Problem

`distanceAtTime` stretches the song over the full route length. When the route is
short and the song long, lyrics bunch up and the cursor crawls. Instead of
compressing the song, lengthen the route: suggest a scenic detour through points
of interest (POIs) so the trip duration roughly matches the song duration.

## Trigger & UX

- Reference speeds per profile: foot 1.3 m/s (~4.7 km/h), bike 4.2 m/s
  (~15 km/h), car 11.1 m/s (~40 km/h).
- Once **both** route and audio are loaded, estimate trip duration as
  `route.total / speed(profile)`. If `songDuration > tripDuration × 1.2`, show a
  **“✨ Add a detour”** button in the panel with a status like *“Song is 4 min
  longer than the trip — add a scenic detour?”*.
- On click the app picks and applies the best POIs automatically (no manual
  selection): amber markers on the chosen POIs, status *“Detour via Jardin des
  Plantes, Pont Neuf (+2.3 km)”*, button flips to **“Remove detour”** (restores
  the direct route). Reset route clears everything.

## Algorithm (approach A: corridor + greedy, haversine pre-filter)

One Overpass query over the route bbox, expanded proportionally to the needed
extra length. Each POI gets a score:

1. **Name match** — a lyric keyword appearing in the POI name: +100 per word.
2. **Category hint** — lyric keywords mapping to the POI's category
   (water words → water POIs, etc.): +30.
3. **Fixed priority fallback** — monuments 4 > parks 3 > water 2 > cafés 1.
4. Plus a small bonus proportional to how much the candidate closes the gap to
   the target length (the ≤110 % overshoot cap already bounds absurd detours;
   added length is the goal, not a cost).

Greedy selection: repeatedly insert the best-scoring POI, estimating the new
route length with chained haversine (waypoints ordered by projection along the
start→end axis). Stop when estimated length reaches ~90 % of the target without
exceeding ~110 %, cap at **3 POIs**. Then a **single OSRM call** with all
waypoints produces the real route. The real length will differ from the
haversine estimate; that is fine — lyrics are re-projected onto the actual
length anyway.

Rejected alternatives: per-candidate OSRM verification (too many calls to the
public FOSSGIS servers); pure geometric offset (no POIs, no link to the song).

## Modules

- **`src/route/overpass.ts`** (new) — `fetchPois(bbox)`: one Overpass QL query
  covering four category groups — monuments/tourism (`tourism=attraction|
  viewpoint|artwork`, `historic=*`), parks (`leisure=park|garden`), water
  (`natural=water`), cafés/culture (`amenity=cafe|theatre|arts_centre`) — with
  `out center` so ways/relations yield a point. Returns
  `{ name?, lngLat, category }[]`.
- **`src/lyrics/keywords.ts`** (new) — `extractKeywords(lines)`: tokenize,
  lowercase, strip accents, FR/EN stopwords, words ≥ 4 letters. Plus a small
  FR/EN thematic lexicon mapping words (mer, rivière, jardin, fleur, château,
  café, danser…) to the four categories → `categoryHints`.
- **`src/route/detour.ts`** (new, pure, testable) —
  `needsDetour(total, duration, profile)` (×1.2 threshold);
  `scorePoi(poi, keywords, hints)`;
  `selectWaypoints(pois, start, end, target)` (greedy as above).
- **`src/route/routing.ts`** — `fetchRoute` generalized to N points
  (`fetchRoute(points: LngLat[], profile)`); callers and tests updated.
- **`main.ts` / `ui/controls.ts` / `index.html`** — detour state, button, amber
  markers, wiring in `tryBuildSegments` / `computeRoute`.

## Error handling

Overpass failure or zero POIs → explicit status (*“No interesting detour found
nearby”*), direct route untouched. OSRM failure on the waypoint route → keep
the direct route and say so. A detour is never applied without a valid new
geometry.

## Testing

TDD like the rest of the project; network calls mocked.

- `keywords`: tokenization, stopwords, accent stripping, category hints.
- `detour`: threshold, score hierarchy (name > category hint > fixed priority),
  greedy selection (target reached, 3-POI cap, ordering along the route axis).
- `overpass`: parsing a mocked response (nodes + ways with `center`).
- `routing`: multi-waypoint URL construction.
