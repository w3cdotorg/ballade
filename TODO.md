# Ballade — Development roadmap

*Lyrics written along your route on the map — work in progress.*

## UX

- [ ] Replace "Choose file" buttons with drag-and-drop zone (drop audio file anywhere on the page)
- [ ] Auto-fetch lyrics after file is dropped (no manual button click needed)
- [ ] Clear artist/title fields when loading a new audio file (prevent re-fetching previous song's lyrics by mistake)

## Map & rendering

- [ ] Reduce word overlap at low zoom in tight curves (e.g. fade or shrink words below z15)

## Test coverage

- [ ] VTT edge cases: cues with hour prefixes, consecutive cues without blank lines
- [ ] Nominatim non-2xx error path; `readTrackMeta` happy path (real tags)

## Future phases

- [ ] POI detours when song longer than route: suggest waypoints via Overpass API + OSRM
- [ ] Real GPS mode: `watchPosition` + route projection
- [ ] Apple Music / MusicKit JS integration (note: public API does not expose lyrics)
- [ ] Transit routing: GTFS support
- [ ] Replace surrounding street names with lyrics
