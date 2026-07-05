import type { LyricLine } from '../lyrics/types';

export type LyricsStatus = 'searching' | 'found' | 'notfound';

export interface Track {
  id: number;
  file: File;
  /** Durée de la piste (s). */
  duration: number;
  artist?: string;
  title?: string;
  /** Paroles synchronisées, temps relatifs au début de la piste. */
  lyrics?: LyricLine[];
  lyricsStatus: LyricsStatus;
  /** Décalage des paroles de cette piste (s). */
  offset: number;
  /** Début de la fenêtre [start, start + duration) en temps de voyage (s). */
  start: number;
}

/** Champs modifiables après l'ajout (les fenêtres, elles, ne bougent que par re-pack). */
export type TrackPatch = Partial<Pick<Track, 'artist' | 'title' | 'lyrics' | 'lyricsStatus' | 'offset'>>;

export interface Playlist {
  tracks(): readonly Track[];
  /** Ajoute en fin de liste : start = max(nowT, fin de la dernière piste). Sélectionne la piste. */
  add(file: File, duration: number, nowT: number): Track;
  update(id: number, patch: TrackPatch): void;
  /** Refusé (false) sur une piste verrouillée ; re-cale les futures bout à bout. */
  remove(id: number, nowT: number): boolean;
  moveUp(id: number, nowT: number): boolean;
  moveDown(id: number, nowT: number): boolean;
  /** Retire toutes les pistes non verrouillées. */
  clear(nowT: number): void;
  /** Replay/reset : re-cale toutes les pistes bout à bout depuis 0 (trous vécus oubliés). */
  repackFromZero(): void;
  /** Piste dont la fenêtre contient t (borne de fin exclue). */
  trackAt(t: number): Track | undefined;
  /** Fin de la dernière fenêtre (0 si vide). */
  endOfMusic(): number;
  /** Somme des durées (s). */
  totalMusic(): number;
  /** Verrouillée (passée ou en cours) ssi start < nowT. */
  isLocked(id: number, nowT: number): boolean;
  select(id: number): void;
  selected(): Track | undefined;
}

export function createPlaylist(): Playlist {
  const tracks: Track[] = [];
  let nextId = 1;
  let selectedId: number | undefined;

  const locked = (t: Track, nowT: number): boolean => t.start < nowT;
  const byId = (id: number): Track | undefined => tracks.find((t) => t.id === id);

  /** Re-cale les pistes non verrouillées bout à bout après l'ancrage
   *  max(nowT, fin des pistes verrouillées) ; les trous vécus restent derrière. */
  function repack(nowT: number): void {
    let anchor = nowT;
    for (const t of tracks) {
      if (locked(t, nowT)) anchor = Math.max(anchor, t.start + t.duration);
    }
    for (const t of tracks) {
      if (locked(t, nowT)) continue;
      t.start = anchor;
      anchor += t.duration;
    }
  }

  return {
    tracks: () => tracks,
    add(file, duration, nowT) {
      const endOfLastTrack = tracks.length > 0 ? tracks[tracks.length - 1].start + tracks[tracks.length - 1].duration : 0;
      const start = Math.max(nowT, endOfLastTrack);
      const track: Track = { id: nextId++, file, duration, lyricsStatus: 'searching', offset: 0, start };
      tracks.push(track);
      selectedId = track.id;
      return track;
    },
    update(id, patch) {
      const t = byId(id);
      if (t) Object.assign(t, patch);
    },
    remove(id, nowT) {
      const i = tracks.findIndex((t) => t.id === id);
      if (i === -1 || locked(tracks[i], nowT)) return false;
      tracks.splice(i, 1);
      if (selectedId === id) selectedId = tracks[tracks.length - 1]?.id;
      repack(nowT);
      return true;
    },
    moveUp(id, nowT) {
      const i = tracks.findIndex((t) => t.id === id);
      if (i <= 0 || locked(tracks[i], nowT) || locked(tracks[i - 1], nowT)) return false;
      [tracks[i - 1], tracks[i]] = [tracks[i], tracks[i - 1]];
      repack(nowT);
      return true;
    },
    moveDown(id, nowT) {
      const i = tracks.findIndex((t) => t.id === id);
      if (i === -1 || i >= tracks.length - 1 || locked(tracks[i], nowT) || locked(tracks[i + 1], nowT)) return false;
      [tracks[i], tracks[i + 1]] = [tracks[i + 1], tracks[i]];
      repack(nowT);
      return true;
    },
    clear(nowT) {
      for (let i = tracks.length - 1; i >= 0; i--) {
        if (!locked(tracks[i], nowT)) tracks.splice(i, 1);
      }
      if (selectedId !== undefined && !byId(selectedId)) selectedId = tracks[tracks.length - 1]?.id;
    },
    repackFromZero: () => repack(0),
    trackAt: (t) => tracks.find((tr) => tr.start <= t && t < tr.start + tr.duration),
    endOfMusic: () => tracks.reduce((max, t) => Math.max(max, t.start + t.duration), 0),
    totalMusic: () => tracks.reduce((sum, t) => sum + t.duration, 0),
    isLocked(id, nowT) {
      const t = byId(id);
      return t !== undefined && locked(t, nowT);
    },
    select(id) {
      if (byId(id)) selectedId = id;
    },
    selected: () => (selectedId === undefined ? undefined : byId(selectedId)),
  };
}
