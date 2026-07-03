import type { LyricLine } from './types';

const TIMESTAMP_RE = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Parse un fichier .lrc. `duration` (secondes) sert de fin à la dernière ligne.
 * Les lignes invalides ou sans texte sont ignorées.
 */
export function parseLrc(lrc: string, duration: number): LyricLine[] {
  const entries: { time: number; text: string }[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const times: number[] = [];
    TIMESTAMP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TIMESTAMP_RE.exec(raw))) {
      const fraction = m[3] ? Number(m[3].padEnd(3, '0')) / 1000 : 0;
      times.push(Number(m[1]) * 60 + Number(m[2]) + fraction);
    }
    const text = raw.replace(TIMESTAMP_RE, '').trim();
    if (times.length === 0 || text === '') continue;
    for (const time of times) entries.push({ time, text });
  }
  entries.sort((a, b) => a.time - b.time);
  return entries.map((e, i) => ({
    start: e.time,
    end: i + 1 < entries.length ? entries[i + 1].time : Math.max(duration, e.time),
    text: e.text,
  }));
}
