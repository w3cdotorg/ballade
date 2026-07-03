# Ballade 🎶🗺️

*A "ballade" that becomes a "balade" — French for both a song and a stroll.*

The lyrics of whatever you're listening to, written along your route on the map:
upcoming lyrics ahead of you, the current line highlighted karaoke-style, and behind
you, greyed out, everything the city has already sung.

## Getting started

    npm install
    npm run dev

## Usage

1. **Route** — click a start and a destination on the map (or search an address),
   pick a mode (walking / cycling / driving).
2. **Music** — load an audio file. Synced lyrics are fetched automatically from
   [lrclib.net](https://lrclib.net) using the file's tags; otherwise provide a
   `.lrc` (music) or `.srt`/`.vtt` (podcast transcript).
3. **Play** — the journey begins: the camera follows your simulated position, each
   word is drawn along the path, the current line lights up, and lyrics already sung
   stay greyed out behind you. You reach your destination on the last note.

## Demo without an MP3

    node scripts/make-demo-wav.mjs   # generates samples/demo.wav (60 s)

Then load `samples/demo.wav` + `samples/chanson-automne.lrc` (Verlaine, public domain).

## Tests

    npm test         # Vitest (parsers, geometry, timeline, mocked HTTP clients)
    npm run typecheck

Design docs (in French): `docs/superpowers/specs/`.
