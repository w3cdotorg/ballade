interface LrclibHit {
  syncedLyrics: string | null;
  duration: number;
}

/**
 * Cherche des paroles synchronisées sur lrclib.net.
 * Renvoie le LRC brut et la durée du meilleur candidat (durée la plus proche), ou null.
 * La durée permet d'avertir quand les paroles sont synchronisées sur un autre
 * pressage du morceau (l'appelant compare avec la durée réelle du fichier audio).
 */
export async function searchLyrics(
  artist: string,
  title: string,
  duration?: number,
): Promise<{ lrc: string; duration: number } | null> {
  const url = new URL('https://lrclib.net/api/search');
  url.searchParams.set('artist_name', artist);
  url.searchParams.set('track_name', title);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lrclib: HTTP ${res.status}`);
  const hits = (await res.json()) as LrclibHit[];
  const synced = hits.filter((h) => h.syncedLyrics);
  if (synced.length === 0) return null;
  if (duration !== undefined) {
    synced.sort((a, b) => Math.abs(a.duration - duration) - Math.abs(b.duration - duration));
  }
  return { lrc: synced[0].syncedLyrics as string, duration: synced[0].duration };
}
