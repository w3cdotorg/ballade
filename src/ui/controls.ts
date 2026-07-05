export interface Controls {
  searchStart: HTMLInputElement;
  searchEnd: HTMLInputElement;
  profile: HTMLSelectElement;
  resetRoute: HTMLButtonElement;
  audioFile: HTMLInputElement;
  dropzone: HTMLDivElement;
  dropOverlay: HTMLDivElement;
  browseAudio: HTMLAnchorElement;
  browseLyrics: HTMLAnchorElement;
  artist: HTMLInputElement;
  title: HTMLInputElement;
  fetchLyrics: HTMLButtonElement;
  lyricsFile: HTMLInputElement;
  lyricsOffset: HTMLInputElement;
  detour: HTMLButtonElement;
  play: HTMLButtonElement;
  volume: HTMLInputElement;
  status: HTMLParagraphElement;
  offer: HTMLParagraphElement;
  playlist: HTMLUListElement;
  clearPlaylist: HTMLButtonElement;
}

export function getControls(): Controls {
  const byId = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Element #${id} not found in index.html`);
    return el as T;
  };
  return {
    searchStart: byId('search-start'),
    searchEnd: byId('search-end'),
    profile: byId('profile'),
    resetRoute: byId('reset-route'),
    audioFile: byId('audio-file'),
    dropzone: byId('dropzone'),
    dropOverlay: byId('drop-overlay'),
    browseAudio: byId('browse-audio'),
    browseLyrics: byId('browse-lyrics'),
    artist: byId('artist'),
    title: byId('title'),
    fetchLyrics: byId('fetch-lyrics'),
    lyricsFile: byId('lyrics-file'),
    lyricsOffset: byId('lyrics-offset'),
    detour: byId('detour'),
    play: byId('play'),
    volume: byId('volume'),
    status: byId('status'),
    offer: byId('offer'),
    playlist: byId('playlist'),
    clearPlaylist: byId('clear-playlist'),
  };
}
