# Ballade — Development roadmap

*Lyrics written along your route on the map — work in progress.*

## Done

- [x] Drag-and-drop zone (drop audio/lyrics files anywhere on the page)
- [x] Auto-fetch lyrics from lrclib using the file's tags
- [x] Word-by-word rendering along the path (karaoke states past/current/future)
- [x] POI detours when the music outlasts the trip (Overpass + OSRM, lyrics-aware scoring)
- [x] Constant realistic cursor speed (OSRM travel time) + silent phase to the destination
- [x] Playlist: multiple tracks back-to-back, reorder/remove, per-track lyrics, add mid-journey
- [x] Explicit journey phase machine + epoch guard (pause/reset never lost to async races)
- [x] Persistent offer line + multi-drop summary statuses
- [x] Basemap switcher (Liberty / Bright / Positron) with lyric layer re-add
- [x] UI restyle: squircles, pink/ink palette, custom teardrop markers, pulsing cursor
- [x] Map clicks fill the Start/Destination fields (`lat, lng`); reset clears them

## UX & polish

- [ ] Reverse-geocode clicked points (fields currently hold raw `lat, lng`; pressing
      Enter on them geocodes to the nearest POI — approximate)
- [ ] Basemap control a11y: Escape / outside-click dismissal, `aria-expanded`
- [ ] Skip-track status can be masked when the skip lands directly on silence/arrival
      (near-unreachable path)
- [ ] Words re-render as "future" after switching basemap post-arrival (journeyT reset)

## Map & rendering

- [ ] Reduce word overlap at low zoom in tight curves (e.g. fade or shrink words below z15)
- [ ] Basemap re-add relies on MapLibre's style-diff *failing* (full reload → `style.load`);
      if a diff ever succeeds between two basemaps, the lyric layer would vanish until the
      next rebuild — theoretical today, worth a `styledata`-based fallback if it bites
- [ ] Deduplicate the Liberty style URL (`map.ts` vs `basemapControl.ts`)

## Playlist (deferred by design)

- [ ] Drag-and-drop reordering (↑↓ buttons only for now)
- [ ] Playlist persistence across sessions
- [ ] Seek / skip within a track
- [ ] Gapless/crossfade between tracks (~100 ms load latency accepted)

## Detour

- [ ] Overpass corridor uses a single bbox; long diagonal routes query a huge rectangle

## Test coverage

- [ ] VTT edge cases: cues with hour prefixes, consecutive cues without blank lines
- [ ] Nominatim non-2xx error path; `readTrackMeta` happy path (real tags)

## Future phases

- [ ] Real GPS mode: `watchPosition` + route projection
- [ ] Apple Music / MusicKit JS integration (note: public API does not expose lyrics)
- [ ] Transit routing: GTFS support
- [ ] Replace surrounding street names with lyrics
