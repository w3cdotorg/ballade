import { parseBlob } from 'music-metadata';

/** Lit artiste/titre dans les tags du fichier audio. Jamais d'exception. */
export async function readTrackMeta(file: File): Promise<{ artist?: string; title?: string }> {
  try {
    const meta = await parseBlob(file);
    const out: { artist?: string; title?: string } = {};
    if (meta.common.artist) out.artist = meta.common.artist;
    if (meta.common.title) out.title = meta.common.title;
    return out;
  } catch {
    return {};
  }
}
