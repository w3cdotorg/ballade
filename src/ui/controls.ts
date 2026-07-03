export interface Controls {
  searchStart: HTMLInputElement;
  searchEnd: HTMLInputElement;
  profile: HTMLSelectElement;
  resetRoute: HTMLButtonElement;
  audioFile: HTMLInputElement;
  artist: HTMLInputElement;
  title: HTMLInputElement;
  fetchLyrics: HTMLButtonElement;
  lyricsFile: HTMLInputElement;
  play: HTMLButtonElement;
  volume: HTMLInputElement;
  status: HTMLParagraphElement;
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
    artist: byId('artist'),
    title: byId('title'),
    fetchLyrics: byId('fetch-lyrics'),
    lyricsFile: byId('lyrics-file'),
    play: byId('play'),
    volume: byId('volume'),
    status: byId('status'),
  };
}
