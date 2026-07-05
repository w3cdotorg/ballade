import type { Track } from '../playlist/playlist';

export interface PlaylistViewCallbacks {
  onSelect(id: number): void;
  onRemove(id: number): void;
  onMoveUp(id: number): void;
  onMoveDown(id: number): void;
}

const STATUS_ICON: Record<Track['lyricsStatus'], string> = {
  searching: '…',
  found: '✓',
  notfound: '✗',
};

function fmtTrackDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Re-rend toute la liste à chaque appel — trivial et suffisant à cette échelle. */
export function renderPlaylist(
  ul: HTMLUListElement,
  tracks: readonly Track[],
  selectedId: number | undefined,
  lockedIds: ReadonlySet<number>,
  cb: PlaylistViewCallbacks,
): void {
  ul.hidden = tracks.length === 0;
  const rows = tracks.map((t, i) => {
    const li = document.createElement('li');
    const isLocked = lockedIds.has(t.id);
    if (t.id === selectedId) li.classList.add('selected');
    if (isLocked) li.classList.add('locked');
    const label = document.createElement('span');
    label.className = 'grow';
    label.textContent = `${i + 1}. ${t.title ?? t.file.name} — ${fmtTrackDuration(t.duration)} ${STATUS_ICON[t.lyricsStatus]}`;
    li.append(label);
    const btn = (text: string, title: string, disabled: boolean, onClick: () => void): void => {
      const b = document.createElement('button');
      b.textContent = text;
      b.title = title;
      b.disabled = disabled;
      b.addEventListener('click', (e) => {
        e.stopPropagation(); // le clic bouton ne doit pas aussi sélectionner la ligne
        onClick();
      });
      li.append(b);
    };
    const prevLocked = i === 0 || lockedIds.has(tracks[i - 1].id);
    btn('↑', 'Move up', isLocked || prevLocked, () => cb.onMoveUp(t.id));
    btn('↓', 'Move down', isLocked || i === tracks.length - 1, () => cb.onMoveDown(t.id));
    btn('×', 'Remove', isLocked, () => cb.onRemove(t.id));
    li.addEventListener('click', () => cb.onSelect(t.id));
    return li;
  });
  ul.replaceChildren(...rows);
}
