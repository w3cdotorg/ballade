/** Durée lisible pour les statuts : "45 min", "1 h 06", "2 d 4 h". Deux unités max. */
export function formatDuration(seconds: number): string {
  const min = Math.floor(Math.max(0, seconds) / 60);
  if (min < 1) return '<1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return hr === 0 ? `${d} d` : `${d} d ${hr} h`;
}
