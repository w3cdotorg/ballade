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
import { buildSegments, distanceAtTime } from './sync/timeline';
import { layoutWords, type WordFeature } from './map/wordLayout';
import { createPlayer } from './sync/player';
import { getControls } from './ui/controls';
import type { LyricLine } from './lyrics/types';

// Zoom soutenu pendant le voyage : plus on est près, plus les tronçons sont longs à
// l'écran et moins les mots d'une même ligne se chevauchent dans les virages.
const TRAVEL_ZOOM = 17;

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
  state.words = layoutWords(buildSegments(state.lyrics, state.route, state.duration));
  const add = () => {
    if (state.words) addLyricLayer(map, state.words);
  };
  // 'idle' (not 'load') as fallback: isStyleLoaded() can return a transient false after
  // the map has already loaded, in which case 'load' would never fire again.
  if (map.isStyleLoaded()) add();
  else map.once('idle', add);
  cursor.setLngLat(pointAt(state.route, 0)).addTo(map);
  c.play.disabled = false;
  status('Prêt ! Lance le voyage.');
}

async function computeRoute(): Promise<void> {
  if (!state.start || !state.end) return;
  status("Calcul de l'itinéraire…");
  try {
    const coords = await fetchRoute(state.start, state.end, c.profile.value as Profile);
    state.route = buildRouteGeometry(coords);
    const bounds = coords.reduce(
      (b, p) => b.extend(p),
      new maplibregl.LngLatBounds(coords[0], coords[0]),
    );
    map.fitBounds(bounds, { padding: 80 });
    status(`Itinéraire : ${(state.route.total / 1000).toFixed(1)} km.`);
    tryBuildSegments();
  } catch (err) {
    status(`Erreur d'itinéraire : ${(err as Error).message}`);
  }
}

map.on('click', (e) => {
  const lngLat: LngLat = [e.lngLat.lng, e.lngLat.lat];
  if (!state.start) {
    state.start = lngLat;
    startMarker.setLngLat(lngLat).addTo(map);
    status("Départ posé. Clique l'arrivée.");
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
  c.play.textContent = '▶ Lancer le voyage';
  status('Clique sur la carte : départ, puis arrivée.');
});

function bindSearch(input: HTMLInputElement, which: 'start' | 'end'): void {
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter' || input.value.trim() === '') return;
    status("Recherche de l'adresse…");
    try {
      const results = await geocode(input.value);
      if (results.length === 0) {
        status('Adresse introuvable.');
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
      status(`Erreur Nominatim : ${(err as Error).message}`);
    }
  });
}
bindSearch(c.searchStart, 'start');
bindSearch(c.searchEnd, 'end');

c.audioFile.addEventListener('change', async () => {
  const file = c.audioFile.files?.[0];
  if (!file) return;
  // Invalidate the previous song's lyrics/segments up front: if the new file has no
  // usable tags or lrclib finds nothing, they must not survive and let play stay
  // enabled (song B would then play over song A's segments). The normal
  // tryBuildSegments paths below re-enable play once new segments are ready.
  state.lyrics = undefined;
  state.words = undefined;
  c.play.disabled = true;
  clearLyricLayer(map);
  status("Chargement de l'audio…");
  try {
    state.duration = await player.load(file);
  } catch (err) {
    status((err as Error).message);
    return;
  }
  const meta = await readTrackMeta(file);
  if (meta.artist) c.artist.value = meta.artist;
  if (meta.title) c.title.value = meta.title;
  status(`Audio chargé (${Math.round(state.duration)} s).`);
  if (c.artist.value && c.title.value) void fetchLyricsFromLrclib();
  else status('Audio chargé. Renseigne artiste + titre, ou fournis un fichier de paroles.');
});

async function fetchLyricsFromLrclib(): Promise<void> {
  if (!state.duration) {
    status("Charge d'abord le fichier audio.");
    return;
  }
  if (c.artist.value.trim() === '' || c.title.value.trim() === '') {
    status('Renseigne artiste et titre.');
    return;
  }
  status('Recherche des paroles sur lrclib…');
  try {
    const lrc = await searchLyrics(c.artist.value, c.title.value, state.duration);
    if (!lrc) {
      status('Pas de paroles synchronisées trouvées — fournis un fichier .lrc/.vtt.');
      return;
    }
    state.lyrics = parseLrc(lrc, state.duration);
    status(`${state.lyrics.length} lignes de paroles trouvées.`);
    tryBuildSegments();
  } catch (err) {
    status(`Erreur lrclib : ${(err as Error).message}`);
  }
}
c.fetchLyrics.addEventListener('click', () => void fetchLyricsFromLrclib());

c.lyricsFile.addEventListener('change', async () => {
  const file = c.lyricsFile.files?.[0];
  if (!file) return;
  if (!state.duration) {
    status("Charge d'abord le fichier audio.");
    return;
  }
  const text = await file.text();
  state.lyrics = file.name.toLowerCase().endsWith('.lrc')
    ? parseLrc(text, state.duration)
    : parseVtt(text);
  status(`${state.lyrics.length} lignes de paroles chargées.`);
  tryBuildSegments();
});

player.audio.addEventListener('ended', () => {
  c.play.textContent = '▶ Relancer le voyage';
});

c.volume.addEventListener('input', () => {
  player.audio.volume = Number(c.volume.value);
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
      c.play.textContent = '▶ Lancer le voyage';
      status(`Lecture impossible : ${(err as Error).message}`);
    }
  } else {
    player.pause();
    c.play.textContent = '▶ Reprendre';
  }
});
