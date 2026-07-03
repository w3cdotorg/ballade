export type FileKind = 'audio' | 'lyrics' | 'unknown';

const LYRICS_EXT = /\.(lrc|srt|vtt)$/i;
const AUDIO_EXT = /\.(mp3|flac|m4a|aac|ogg|oga|opus|wav|aiff?|wma)$/i;

/** Classe un fichier déposé : paroles (par extension), audio (MIME ou extension), sinon inconnu. */
export function classifyFile(name: string, mimeType: string): FileKind {
  if (LYRICS_EXT.test(name)) return 'lyrics';
  if (mimeType.startsWith('audio/') || AUDIO_EXT.test(name)) return 'audio';
  return 'unknown';
}
