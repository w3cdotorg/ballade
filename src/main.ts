import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import maplibregl from 'maplibre-gl';
import { createMap, followPoint } from './map/map';
import { addLyricLayer, clearLyricLayer, updateLyricStates } from './map/lyricLayer';
import { fetchRoute, geocode, type Profile } from './route/routing';
import { buildRouteGeometry, pointAt, type LngLat, type RouteGeometry } from './route/geometry';
import { parseLrc } from './lyrics/lrcParser';
import { parseVtt } from './lyrics/vttParser';
import { searchLyrics } from './lyrics/lrclib';
import { readTrackMeta } from './lyrics/metadata';
import { buildSegments, distanceAtTime, shiftLyrics } from './sync/timeline';
import { layoutWords, type WordFeature } from './map/wordLayout';
import { createPlayer } from './sync/player';
import { getControls } from './ui/controls';
import { classifyFile } from './ui/fileRouting';
import type { LyricLine } from './lyrics/types';

// Zoom soutenu pendant le voyage : plus on est près, plus les tronçons sont longs à
// l'écran et moins les mots d'une même ligne se chevauchent dans les virages.
// 19 ≈ niveau rue (~0,18 m/px à Paris), calé sur le rendu préféré de l'utilisateur.
const TRAVEL_ZOOM = 19;

const c = getControls();
const map = createMap(document.getElementById('map')!);

const state: {
  start?: LngLat;
  end?: LngLat;
  route?: RouteGeometry;
  lyrics?: LyricLine[];
  duration?: number;
  words?: WordFeature[];
} = {};

const startMarker = new maplibregl.Marker({ color: '#2563eb' });
const endMarker = new maplibregl.Marker({ color: '#e8336d' });
const cursor = new maplibregl.Marker({ color: '#111827', scale: 0.8 });

// Zoom floor: while armed, the follow camera forces TRAVEL_ZOOM on every tick so the
// player converges into the street-level view. Any real user zoom gesture (wheel/pinch/
// dblclick) disarms it so manual zoom-out sticks; re-armed on play-from-start / reset.
let zoomFloorArmed = true;
map.on('wheel', () => {
  zoomFloorArmed = false;
});
map.on('zoomstart', (e) => {
  // originalEvent present = user gesture; absent = our own easeTo animation.
  if (e.originalEvent) zoomFloorArmed = false;
});

function status(msg: string): void {
  c.status.textContent = msg;
}

const player = createPlayer((t) => {
  if (!state.route || !state.words || !state.duration) return;
  const pos = pointAt(state.route, distanceAtTime(t, state.duration, state.route.total));
  cursor.setLngLat(pos);
  followPoint(map, pos, zoomFloorArmed ? Math.max(map.getZoom(), TRAVEL_ZOOM) : undefined);
  updateLyricStates(map, state.words, t);
});

function tryBuildSegments(): void {
  if (!state.route || !state.lyrics || !state.duration) return;
  const offset = Number(c.lyricsOffset.value) || 0;
  const lines = offset === 0 ? state.lyrics : shiftLyrics(state.lyrics, offset);
  state.words = layoutWords(buildSegments(lines, state.route, state.duration));
  const add = () => {
    if (state.words) addLyricLayer(map, state.words);
  };
  // 'idle' (not 'load') as fallback: isStyleLoaded() can return a transient false after
  // the map has already loaded, in which case 'load' would never fire again.
  if (map.isStyleLoaded()) add();
  else map.once('idle', add);
  const d = distanceAtTime(player.audio.currentTime, state.duration, state.route.total);
  cursor.setLngLat(pointAt(state.route, d)).addTo(map);
  if (c.play.disabled) {
    c.play.disabled = false;
    status('Ready! Start the journey.');
  }
}

async function computeRoute(): Promise<void> {
  if (!state.start || !state.end) return;
  status('Calculating the route…');
  try {
    const coords = await fetchRoute([state.start, state.end], c.profile.value as Profile);
    state.route = buildRouteGeometry(coords);
    const bounds = coords.reduce(
      (b, p) => b.extend(p),
      new maplibregl.LngLatBounds(coords[0], coords[0]),
    );
    map.fitBounds(bounds, { padding: 80 });
    status(`Route: ${(state.route.total / 1000).toFixed(1)} km.`);
    tryBuildSegments();
  } catch (err) {
    status(`Routing error: ${(err as Error).message}`);
  }
}

map.on('click', (e) => {
  const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];
  if (!state.start) {
    state.start = lngLat;
    startMarker.setLngLat(lngLat).addTo(map);
    status('Start set. Click the destination.');
  } else if (!state.end) {
    state.end = lngLat;
    endMarker.setLngLat(lngLat).addTo(map);
    void computeRoute();
  }
});

c.resetRoute.addEventListener('click', () => {
  player.pause();
  // Rewind so the next play starts at 0 on the new route (re-arms the zoom floor,
  // gated on currentTime === 0) instead of resuming mid-song from the old route.
  if (player.audio.src) player.audio.currentTime = 0;
  zoomFloorArmed = true;
  state.start = state.end = state.route = state.words = undefined;
  startMarker.remove();
  endMarker.remove();
  cursor.remove();
  clearLyricLayer(map);
  c.play.disabled = true;
  c.play.textContent = '▶ Start the journey';
  status('Click the map: start, then destination.');
});

function bindSearch(input: HTMLInputElement, which: 'start' | 'end'): void {
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || input.value.trim() === '') return;
    status('Searching for the address…');
    try {
      const results = await geocode(input.value);
      if (results.length === 0) {
        status('Address not found.');
        return;
      }
      const { label, lngLat } = results[0];
      const marker = which === 'start' ? startMarker : endMarker;
      state[which] = lngLat;
      marker.setLngLat(lngLat).addTo(map);
      status(label);
      if (state.start && state.end) void computeRoute();
      else map.flyTo({ center: lngLat, zoom: 14 });
    } catch (err) {
      status(`Nominatim error: ${(err as Error).message}`);
    }
  });
}
bindSearch(c.searchStart, 'start');
bindSearch(c.searchEnd, 'end');

async function loadAudioFile(file: File): Promise<void> {
  // Invalidate the previous song's lyrics/segments up front: if the new file has no
  // usable tags or lrclib finds nothing, they must not survive and let play stay
  // enabled (song B would then play over song A's segments). The normal
  // tryBuildSegments paths below re-enable play once new segments are ready.
  // Artist/title are cleared too, so a tagless file can't silently re-fetch the
  // previous song's lyrics.
  state.lyrics = undefined;
  state.words = undefined;
  c.play.disabled = true;
  c.artist.value = '';
  c.title.value = '';
  clearLyricLayer(map);
  status('Loading audio…');
  try {
    state.duration = await player.load(file);
  } catch (err) {
    status((err as Error).message);
    return;
  }
  const meta = await readTrackMeta(file);
  if (meta.artist) c.artist.value = meta.artist;
  if (meta.title) c.title.value = meta.title;
  const loaded = `Audio loaded (${Math.round(state.duration)} s).`;
  if (c.artist.value && c.title.value) {
    status(loaded);
    void fetchLyricsFromLrclib();
  } else {
    status(`${loaded} Fill in artist + title, or provide a lyrics file.`);
  }
}

c.audioFile.addEventListener('change', () => {
  const file = c.audioFile.files?.[0];
  if (file) void loadAudioFile(file);
});

async function fetchLyricsFromLrclib(): Promise<void> {
  if (!state.duration) {
    status('Load the audio file first.');
    return;
  }
  if (c.artist.value.trim() === '' || c.title.value.trim() === '') {
    status('Fill in artist and title.');
    return;
  }
  status('Searching lrclib for lyrics…');
  try {
    const hit = await searchLyrics(c.artist.value, c.title.value, state.duration);
    if (!hit) {
      status('No synced lyrics found — provide a .lrc/.vtt file.');
      return;
    }
    state.lyrics = parseLrc(hit.lrc, state.duration);
    const drift = Math.abs(hit.duration - state.duration);
    status(
      `${state.lyrics.length} lyric lines found.` +
        (drift > 3
          ? ` ⚠ Synced to a ${Math.round(hit.duration)} s edit (your file: ${Math.round(
              state.duration,
            )} s) — adjust the lyrics offset if they drift.`
          : ''),
    );
    tryBuildSegments();
  } catch (err) {
    status(`lrclib error: ${(err as Error).message}`);
  }
}
c.fetchLyrics.addEventListener('click', () => void fetchLyricsFromLrclib());

async function loadLyricsFile(file: File): Promise<void> {
  if (!state.duration) {
    status('Load the audio file first.');
    return;
  }
  const text = await file.text();
  state.lyrics = file.name.toLowerCase().endsWith('.lrc')
    ? parseLrc(text, state.duration)
    : parseVtt(text);
  status(`${state.lyrics.length} lyric lines loaded.`);
  tryBuildSegments();
}

c.lyricsFile.addEventListener('change', () => {
  const file = c.lyricsFile.files?.[0];
  if (file) void loadLyricsFile(file);
});

c.dropzone.addEventListener('click', () => c.audioFile.click());
c.dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') c.audioFile.click();
});
c.browseAudio.addEventListener('click', (e) => {
  e.preventDefault();
  c.audioFile.click();
});
c.browseLyrics.addEventListener('click', (e) => {
  e.preventDefault();
  c.lyricsFile.click();
});

// Toute la page est une cible de dépôt : l'overlay apparaît dès qu'un fichier
// entre dans la fenêtre. dragenter/dragleave se déclenchent sur chaque élément
// traversé, d'où le compteur de profondeur.
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (e.dataTransfer?.types.includes('Files')) {
    dragDepth++;
    c.dropOverlay.hidden = false;
  }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) c.dropOverlay.hidden = true;
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  c.dropOverlay.hidden = true;
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  switch (classifyFile(file.name, file.type)) {
    case 'lyrics':
      void loadLyricsFile(file);
      break;
    case 'audio':
      void loadAudioFile(file);
      break;
    default:
      status(`Unsupported file: ${file.name}`);
  }
});

player.audio.addEventListener('ended', () => {
  c.play.textContent = '▶ Replay the journey';
});

c.volume.addEventListener('input', () => {
  player.audio.volume = Number(c.volume.value);
});

c.lyricsOffset.addEventListener('input', () => {
  if (!state.lyrics) return;
  tryBuildSegments();
  if (state.words) updateLyricStates(map, state.words, player.audio.currentTime);
});

c.play.addEventListener('click', async () => {
  if (player.audio.paused) {
    if (player.audio.ended) player.audio.currentTime = 0;
    // Only re-arm the zoom floor when starting from the beginning (first play or
    // replay-after-ended, which seeks to 0 above). Resuming mid-song must not
    // discard the user's manual zoom choice.
    if (player.audio.currentTime === 0) {
      zoomFloorArmed = true;
      map.easeTo({ zoom: Math.max(map.getZoom(), TRAVEL_ZOOM), duration: 800 });
    }
    try {
      await player.play();
      c.play.textContent = '⏸ Pause';
    } catch (err) {
      c.play.textContent = '▶ Start the journey';
      status(`Playback failed: ${(err as Error).message}`);
    }
  } else {
    player.pause();
    c.play.textContent = '▶ Resume';
  }
});
