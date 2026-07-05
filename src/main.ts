import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import maplibregl from 'maplibre-gl';
import { createMap, followPoint } from './map/map';
import { addLyricLayer, clearLyricLayer, updateLyricStates } from './map/lyricLayer';
import { fetchRoute, geocode, type Profile } from './route/routing';
import { buildRouteGeometry, pointAt, type LngLat, type RouteGeometry } from './route/geometry';
import { fetchPois } from './route/overpass';
import {
  averageSpeed,
  categoryHints,
  corridorBbox,
  detourMargin,
  needsDetour,
  selectWaypoints,
  targetLength,
  type Poi,
} from './route/detour';
import { extractKeywords } from './lyrics/keywords';
import { parseLrc } from './lyrics/lrcParser';
import { parseVtt } from './lyrics/vttParser';
import { searchLyrics } from './lyrics/lrclib';
import { readTrackMeta } from './lyrics/metadata';
import { buildSegments, distanceAtTime, shiftLyrics } from './sync/timeline';
import { layoutWords, type WordFeature } from './map/wordLayout';
import { createPlayer, probeDuration } from './sync/player';
import { startSilentJourney, type SilentJourney } from './sync/journeyClock';
import { createPlaylist, type Track } from './playlist/playlist';
import { getControls } from './ui/controls';
import { classifyFile } from './ui/fileRouting';
import { formatDuration } from './ui/format';
import { renderPlaylist } from './ui/playlistView';
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
  words?: WordFeature[];
  /** POI du détour appliqué, dans l'ordre du trajet. */
  detourPois?: Poi[];
  /** Trajet direct sauvegardé pour « Remove detour ». */
  directRoute?: RouteGeometry;
} = {};

const playlist = createPlaylist();

/** Machine à états du voyage — remplace l'état implicite silence/audio de la Spec 1. */
type Phase = 'idle' | 'playing' | 'paused' | 'silent' | 'silentPaused' | 'arrived';
let phase: Phase = 'idle';

/** Phase silencieuse en cours (poignée d'annulation du rAF). */
let silentJourney: SilentJourney | undefined;
/** Dernier temps de voyage rendu (s). */
let journeyT = 0;
/** Début de fenêtre de la piste chargée dans le player (temps de voyage). */
let currentTrackStart = 0;
/** Piste actuellement chargée dans le player, pour éviter un rechargement inutile. */
let loadedTrackId: number | undefined;

/** Durée estimée (s) du trajet courant à vitesse réaliste. */
function travelSeconds(): number {
  if (!state.route) return 0;
  return state.route.total / averageSpeed(state.route, c.profile.value as Profile);
}

function status(msg: string): void {
  c.status.textContent = msg;
}

function stopSilentJourney(): void {
  silentJourney?.cancel();
  silentJourney = undefined;
}

function arrive(): void {
  // Voyage terminé : la prochaine route repart de zéro (curseur au départ, replay depuis le début).
  phase = 'arrived';
  journeyT = 0;
  loadedTrackId = undefined;
  c.play.textContent = '▶ Replay the journey';
  status('Arrived!');
  refreshPlaylistView(); // plus rien de verrouillé : la playlist redevient éditable
}

/** Démarre (ou reprend) la progression silencieuse depuis `from` secondes. */
function startSilentPhase(from: number): void {
  stopSilentJourney();
  const until = travelSeconds();
  if (from >= until) {
    arrive();
    return;
  }
  phase = 'silent';
  status(`Music over — the journey continues in silence (~${formatDuration(until - from)} to go).`);
  c.play.textContent = '⏸ Pause';
  silentJourney = startSilentJourney(from, until, renderAt, () => {
    silentJourney = undefined;
    arrive();
  });
}

/** Un changement de route ou de profil modifie la vitesse : recale la phase silencieuse. */
function resyncSilentPhase(): void {
  if (phase === 'silent') startSilentPhase(journeyT);
}

const startMarker = new maplibregl.Marker({ color: '#2563eb' });
const endMarker = new maplibregl.Marker({ color: '#e8336d' });
const cursor = new maplibregl.Marker({ color: '#111827', scale: 0.8 });

// Zoom floor: while armed, the follow camera forces TRAVEL_ZOOM on every tick so the
// player converges into the street-level view. Any real user zoom gesture (wheel/pinch/
// dblclick) disarms it so manual zoom-out sticks; re-armed on journey start / reset.
let zoomFloorArmed = true;
map.on('wheel', () => {
  zoomFloorArmed = false;
});
map.on('zoomstart', (e) => {
  // originalEvent present = user gesture; absent = our own easeTo animation.
  if (e.originalEvent) zoomFloorArmed = false;
});

function renderAt(t: number): void {
  if (!state.route || !state.words) return;
  journeyT = t;
  const speed = averageSpeed(state.route, c.profile.value as Profile);
  const pos = pointAt(state.route, distanceAtTime(t, speed, state.route.total));
  cursor.setLngLat(pos);
  followPoint(map, pos, zoomFloorArmed ? Math.max(map.getZoom(), TRAVEL_ZOOM) : undefined);
  updateLyricStates(map, state.words, t);
}

// Le player émet le temps AUDIO de la piste courante ; le voyage le traduit en temps global.
const player = createPlayer((t) => renderAt(currentTrackStart + t));

// ---------------------------------------------------------------------------
// Playlist : vue, sélection, champs par piste
// ---------------------------------------------------------------------------

function trackLabel(t: Track): string {
  return t.title ?? t.file.name;
}

function refreshPlaylistView(): void {
  const lockedIds = new Set(
    playlist.tracks().filter((t) => playlist.isLocked(t.id, journeyT)).map((t) => t.id),
  );
  renderPlaylist(c.playlist, playlist.tracks(), playlist.selected()?.id, lockedIds, {
    onSelect(id) {
      playlist.select(id);
      syncSelectedFields();
      refreshPlaylistView();
    },
    onRemove(id) {
      if (!playlist.remove(id, journeyT)) return;
      syncSelectedFields();
      afterPlaylistChange();
    },
    onMoveUp(id) {
      if (playlist.moveUp(id, journeyT)) afterPlaylistChange();
    },
    onMoveDown(id) {
      if (playlist.moveDown(id, journeyT)) afterPlaylistChange();
    },
  });
  c.clearPlaylist.hidden = playlist.tracks().length === 0;
}

/** Reflète la piste sélectionnée dans les champs Artist/Title/offset. */
function syncSelectedFields(): void {
  const t = playlist.selected();
  c.artist.value = t?.artist ?? '';
  c.title.value = t?.title ?? '';
  c.lyricsOffset.value = String(t?.offset ?? 0);
}

/** Toute mutation de la liste re-cale des fenêtres → vue, segments, offres, bouton Play. */
function afterPlaylistChange(): void {
  refreshPlaylistView();
  rebuildSegments();
  updatePlayEnabled();
  updateOffers();
}

function updatePlayEnabled(): void {
  const ready = state.route !== undefined && playlist.tracks().length > 0;
  if (ready && c.play.disabled) {
    c.play.disabled = false;
    status('Ready! Start the journey.');
  } else if (!ready) {
    c.play.disabled = true;
  }
}

// ---------------------------------------------------------------------------
// Rendu des paroles : toutes les pistes, décalées de leur fenêtre + offset
// ---------------------------------------------------------------------------

function rebuildSegments(): void {
  if (!state.route) return;
  const lines: LyricLine[] = [];
  for (const t of playlist.tracks()) {
    if (t.lyrics) lines.push(...shiftLyrics(t.lyrics, t.start + t.offset));
  }
  const speed = averageSpeed(state.route, c.profile.value as Profile);
  state.words = layoutWords(buildSegments(lines, state.route, speed));
  const add = () => {
    if (state.words) addLyricLayer(map, state.words);
  };
  // 'idle' (not 'load') as fallback: isStyleLoaded() can return a transient false after
  // the map has already loaded, in which case 'load' would never fire again.
  if (map.isStyleLoaded()) add();
  else map.once('idle', add);
  const d = distanceAtTime(journeyT, speed, state.route.total);
  cursor.setLngLat(pointAt(state.route, d)).addTo(map);
}

// ---------------------------------------------------------------------------
// Lecture : la fenêtre de la piste courante pilote l'audio, le silence comble le reste
// ---------------------------------------------------------------------------

async function playTrack(track: Track): Promise<void> {
  currentTrackStart = track.start;
  if (loadedTrackId !== track.id) {
    try {
      await player.load(track.file);
    } catch (err) {
      status((err as Error).message);
      phase = 'paused';
      c.play.textContent = '▶ Resume';
      return;
    }
    loadedTrackId = track.id;
  }
  // Rattrape l'écart entre le temps de voyage et le début de la fenêtre : quelques
  // frames de silence ont pu s'écouler entre l'ajout de la piste et son démarrage.
  const into = Math.max(0, journeyT - track.start);
  if (Math.abs(player.audio.currentTime - into) > 0.25) player.audio.currentTime = into;
  try {
    await player.play();
    phase = 'playing';
    c.play.textContent = '⏸ Pause';
  } catch (err) {
    phase = 'paused';
    c.play.textContent = '▶ Resume';
    status(`Playback failed: ${(err as Error).message}`);
  }
}

/** Avance le voyage à partir de t : musique si une fenêtre est là, sinon silence. */
function continueJourneyAt(t: number): void {
  journeyT = t;
  const track = playlist.trackAt(t);
  if (track) {
    void playTrack(track);
  } else {
    startSilentPhase(t);
  }
}

function startJourney(): void {
  playlist.repackFromZero();
  journeyT = 0;
  loadedTrackId = undefined;
  zoomFloorArmed = true;
  map.easeTo({ zoom: Math.max(map.getZoom(), TRAVEL_ZOOM), duration: 800 });
  refreshPlaylistView();
  rebuildSegments(); // les fenêtres viennent d'être re-calées
  continueJourneyAt(0);
}

player.audio.addEventListener('ended', () => {
  // player.ts a déjà émis onTick(duration) → journeyT = fin de la fenêtre de la piste.
  if (phase !== 'playing') return; // ended parasite (swap de piste, reset)
  loadedTrackId = undefined;
  if (journeyT >= travelSeconds()) {
    arrive();
    return;
  }
  refreshPlaylistView(); // la piste finie vient de se verrouiller pour de bon
  continueJourneyAt(journeyT);
});

c.play.addEventListener('click', () => {
  switch (phase) {
    case 'playing':
      player.pause();
      phase = 'paused';
      c.play.textContent = '▶ Resume';
      break;
    case 'paused':
      void player.play().then(
        () => {
          phase = 'playing';
          c.play.textContent = '⏸ Pause';
        },
        (err: Error) => status(`Playback failed: ${err.message}`),
      );
      break;
    case 'silent':
      stopSilentJourney();
      phase = 'silentPaused';
      c.play.textContent = '▶ Resume';
      break;
    case 'silentPaused':
      // continueJourneyAt et non startSilentPhase : une piste ajoutée pendant la pause
      // peut couvrir l'instant courant — la reprise doit alors être musicale.
      continueJourneyAt(journeyT);
      break;
    case 'idle':
    case 'arrived':
      startJourney();
      break;
  }
});

// ---------------------------------------------------------------------------
// Ajout de pistes : durée, méta, recherche lrclib par piste
// ---------------------------------------------------------------------------

async function addAudioFile(file: File): Promise<void> {
  status(`Loading ${file.name}…`);
  let duration: number;
  try {
    duration = await probeDuration(file);
  } catch (err) {
    status((err as Error).message);
    return;
  }
  const track = playlist.add(file, duration, journeyT);
  syncSelectedFields();
  afterPlaylistChange();
  // Ajout pendant le silence : la musique reprend immédiatement, AVANT les awaits
  // réseau (tags, lrclib) — l'horloge silencieuse avancerait pendant ce temps et la
  // reprise raterait le début de la fenêtre. Les paroles arriveront en cours de lecture.
  if (phase === 'silent' && playlist.trackAt(journeyT)) {
    stopSilentJourney();
    continueJourneyAt(journeyT);
  }
  const meta = await readTrackMeta(file);
  playlist.update(track.id, { artist: meta.artist, title: meta.title });
  syncSelectedFields();
  refreshPlaylistView();
  if (meta.artist && meta.title) {
    await fetchTrackLyrics(track.id);
  } else {
    playlist.update(track.id, { lyricsStatus: 'notfound' });
    refreshPlaylistView();
    status(`${file.name} added (${Math.round(duration)} s) — fill in artist + title or drop a .lrc for its lyrics.`);
  }
}

async function fetchTrackLyrics(id: number): Promise<void> {
  const track = playlist.tracks().find((t) => t.id === id);
  if (!track) return;
  const { artist, title } = track;
  if (!artist || !title) {
    status('Fill in artist and title.');
    return;
  }
  playlist.update(id, { lyricsStatus: 'searching' });
  refreshPlaylistView();
  status(`Searching lrclib for “${trackLabel(track)}”…`);
  try {
    const hit = await searchLyrics(artist, title, track.duration);
    if (!hit) {
      playlist.update(id, { lyricsStatus: 'notfound' });
      refreshPlaylistView();
      status(`No synced lyrics for “${trackLabel(track)}” — drop a .lrc/.vtt file.`);
      return;
    }
    const lyrics = parseLrc(hit.lrc, track.duration);
    playlist.update(id, { lyrics, lyricsStatus: 'found' });
    const drift = Math.abs(hit.duration - track.duration);
    status(
      `${lyrics.length} lyric lines found for “${trackLabel(track)}”.` +
        (drift > 3
          ? ` ⚠ Synced to a ${Math.round(hit.duration)} s edit (your file: ${Math.round(
              track.duration,
            )} s) — adjust the lyrics offset if they drift.`
          : ''),
    );
    refreshPlaylistView();
    rebuildSegments();
  } catch (err) {
    playlist.update(id, { lyricsStatus: 'notfound' });
    refreshPlaylistView();
    status(`lrclib error: ${(err as Error).message}`);
  }
}

c.fetchLyrics.addEventListener('click', () => {
  const t = playlist.selected();
  if (!t) {
    status('Load an audio file first.');
    return;
  }
  playlist.update(t.id, {
    artist: c.artist.value.trim() || undefined,
    title: c.title.value.trim() || undefined,
  });
  void fetchTrackLyrics(t.id);
});

async function loadLyricsFile(file: File): Promise<void> {
  const track = playlist.selected();
  if (!track) {
    status('Load an audio file first.');
    return;
  }
  const text = await file.text();
  const lyrics = file.name.toLowerCase().endsWith('.lrc')
    ? parseLrc(text, track.duration)
    : parseVtt(text);
  playlist.update(track.id, { lyrics, lyricsStatus: 'found' });
  status(`${lyrics.length} lyric lines loaded for “${trackLabel(track)}”.`);
  refreshPlaylistView();
  rebuildSegments();
}

c.audioFile.addEventListener('change', () => {
  const files = [...(c.audioFile.files ?? [])];
  void (async () => {
    for (const file of files) await addAudioFile(file);
  })();
});

c.lyricsFile.addEventListener('change', () => {
  const file = c.lyricsFile.files?.[0];
  if (file) void loadLyricsFile(file);
});

c.clearPlaylist.addEventListener('click', () => {
  playlist.clear(journeyT);
  syncSelectedFields();
  afterPlaylistChange();
});

c.artist.addEventListener('input', () => {
  const t = playlist.selected();
  if (t) playlist.update(t.id, { artist: c.artist.value.trim() || undefined });
});
c.title.addEventListener('input', () => {
  const t = playlist.selected();
  if (t) playlist.update(t.id, { title: c.title.value.trim() || undefined });
});

c.lyricsOffset.addEventListener('input', () => {
  const t = playlist.selected();
  if (!t) return;
  playlist.update(t.id, { offset: Number(c.lyricsOffset.value) || 0 });
  rebuildSegments();
  if (state.words) updateLyricStates(map, state.words, journeyT);
});

// ---------------------------------------------------------------------------
// Offres : détour quand la musique déborde, suggestion quand elle manque
// ---------------------------------------------------------------------------

const detourMarkers: maplibregl.Marker[] = [];

function clearDetour(): void {
  detourMarkers.forEach((m) => m.remove());
  detourMarkers.length = 0;
  state.detourPois = undefined;
  state.directRoute = undefined;
  c.detour.textContent = '✨ Add a detour';
  c.detour.hidden = true;
  c.detour.disabled = false;
}

// Le bouton n'apparaît que si la musique dépasse nettement la durée estimée du trajet.
function updateDetourOffer(): void {
  if (state.detourPois) return; // détour appliqué : le bouton affiche déjà « Remove »
  const music = playlist.totalMusic();
  if (!state.route || music === 0) {
    c.detour.hidden = true;
    return;
  }
  const speed = averageSpeed(state.route, c.profile.value as Profile);
  const offer = needsDetour(state.route.total, music, speed);
  const wasHidden = c.detour.hidden;
  c.detour.hidden = !offer;
  if (offer && wasHidden) {
    const extra = music - travelSeconds();
    status(`The music outlasts the trip by ~${formatDuration(Math.max(60, extra))} — add a scenic detour?`);
  }
}

function updateOffers(): void {
  updateDetourOffer();
  const music = playlist.totalMusic();
  if (state.route && music > 0 && music < travelSeconds() * 0.8) {
    status(
      `Your playlist covers ${formatDuration(music)} of a ~${formatDuration(travelSeconds())} trip — drop more songs anytime.`,
    );
  }
}

function fitRoute(): void {
  if (!state.route) return;
  const { coords } = state.route;
  const bounds = coords.reduce(
    (b, p) => b.extend(p),
    new maplibregl.LngLatBounds(coords[0], coords[0]),
  );
  map.fitBounds(bounds, { padding: 80 });
}

async function applyDetour(): Promise<void> {
  const music = playlist.totalMusic();
  if (!state.route || music === 0 || !state.start || !state.end) return;
  // Si le trajet change pendant les requêtes (reset, nouvelle adresse), ce détour est périmé.
  const routeAtStart = state.route;
  const profile = c.profile.value as Profile;
  const target = targetLength(music, averageSpeed(state.route, profile));
  c.detour.disabled = true;
  status('Searching for a scenic detour…');
  try {
    const bbox = corridorBbox(state.route.coords, detourMargin(target - state.route.total));
    let pois: Poi[];
    try {
      pois = await fetchPois(bbox);
    } catch {
      // Overpass indisponible : traité comme "pas de détour trouvé", pas comme une erreur.
      status('No interesting detour found nearby.');
      return;
    }
    if (state.route !== routeAtStart) return;
    const allLines = playlist.tracks().flatMap((t) => t.lyrics ?? []);
    const keywords = allLines.length > 0 ? extractKeywords(allLines) : new Set<string>();
    const { waypoints } = selectWaypoints(pois, {
      start: state.start,
      end: state.end,
      directLength: state.route.total,
      target,
      keywords,
      hints: categoryHints(keywords),
    });
    if (waypoints.length === 0) {
      status('No interesting detour found nearby.');
      return;
    }
    const detourRoute = await fetchRoute(
      [state.start, ...waypoints.map((w) => w.lngLat), state.end],
      profile,
    );
    if (state.route !== routeAtStart) return;
    state.directRoute = state.route;
    state.route = buildRouteGeometry(detourRoute.coords, detourRoute.duration);
    state.detourPois = waypoints;
    for (const w of waypoints) {
      detourMarkers.push(
        new maplibregl.Marker({ color: '#f59e0b' }).setLngLat(w.lngLat).addTo(map),
      );
    }
    fitRoute();
    rebuildSegments();
    const names = waypoints.map((w) => w.name ?? 'a scenic spot').join(', ');
    const addedKm = (state.route.total - state.directRoute.total) / 1000;
    status(`Detour via ${names} (+${addedKm.toFixed(1)} km).`);
    c.detour.textContent = '✕ Remove detour';
    c.detour.hidden = false;
    resyncSilentPhase();
  } catch (err) {
    status(`Detour error: ${(err as Error).message}`);
  } finally {
    c.detour.disabled = false;
  }
}

function removeDetour(): void {
  if (!state.directRoute) return;
  state.route = state.directRoute;
  clearDetour();
  fitRoute();
  rebuildSegments();
  updateOffers();
  status(`Route: ${(state.route.total / 1000).toFixed(1)} km · ~${formatDuration(travelSeconds())}.`);
  resyncSilentPhase();
}

c.detour.addEventListener('click', () => {
  if (state.detourPois) removeDetour();
  else void applyDetour();
});

// Le seuil de détour dépend de la vitesse du profil : le bouton doit se mettre à jour
// si l'utilisateur change de mode de transport après avoir chargé trajet + audio.
c.profile.addEventListener('change', () => {
  updateOffers();
  resyncSilentPhase();
});

// ---------------------------------------------------------------------------
// Route : clics carte, recherche d'adresses, reset
// ---------------------------------------------------------------------------

async function computeRoute(): Promise<void> {
  if (!state.start || !state.end) return;
  status('Calculating the route…');
  try {
    clearDetour();
    const { coords, duration } = await fetchRoute([state.start, state.end], c.profile.value as Profile);
    state.route = buildRouteGeometry(coords, duration);
    fitRoute();
    status(`Route: ${(state.route.total / 1000).toFixed(1)} km · ~${formatDuration(travelSeconds())}.`);
    rebuildSegments();
    updatePlayEnabled();
    updateOffers();
    resyncSilentPhase();
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
  stopSilentJourney();
  phase = 'idle';
  journeyT = 0;
  loadedTrackId = undefined;
  // La playlist survit au reset, mais re-calée depuis zéro : un ancrage pris en cours
  // de voyage (ajout pendant le silence) créerait sinon un trou au prochain départ.
  playlist.repackFromZero();
  if (player.audio.src) player.audio.currentTime = 0;
  zoomFloorArmed = true;
  clearDetour();
  state.start = state.end = state.route = state.words = undefined;
  startMarker.remove();
  endMarker.remove();
  cursor.remove();
  clearLyricLayer(map);
  refreshPlaylistView();
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

// ---------------------------------------------------------------------------
// Dropzone : toute la page accepte audio (multiples) et paroles
// ---------------------------------------------------------------------------

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
  const files = [...(e.dataTransfer?.files ?? [])];
  if (files.length === 0) return;
  void (async () => {
    for (const file of files) {
      switch (classifyFile(file.name, file.type)) {
        case 'lyrics':
          await loadLyricsFile(file);
          break;
        case 'audio':
          await addAudioFile(file);
          break;
        default:
          status(`Unsupported file: ${file.name}`);
      }
    }
  })();
});

c.volume.addEventListener('input', () => {
  player.audio.volume = Number(c.volume.value);
});
