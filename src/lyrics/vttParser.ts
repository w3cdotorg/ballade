import type { LyricLine } from './types';

const CUE_RE =
  /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{3})/;

function toSeconds(h: string | undefined, m: string, s: string, ms: string): number {
  return (h ? Number(h) * 3600 : 0) + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

/** Parse un transcript WebVTT ou SRT. Les balises HTML des cues sont retirées. */
export function parseVtt(input: string): LyricLine[] {
  const lines = input.split(/\r?\n/);
  const out: LyricLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = CUE_RE.exec(lines[i]);
    if (!m) continue;
    const start = toSeconds(m[1], m[2], m[3], m[4]);
    const end = toSeconds(m[5], m[6], m[7], m[8]);
    const textLines: string[] = [];
    while (i + 1 < lines.length && lines[i + 1].trim() !== '') {
      i++;
      textLines.push(lines[i].trim());
    }
    const text = textLines.join(' ').replace(/<[^>]+>/g, '').trim();
    if (text !== '') out.push({ start, end, text });
  }
  return out;
}
