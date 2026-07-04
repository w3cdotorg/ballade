import type { LyricLine } from '../lyrics/types';
import { sliceRoute, type LngLat, type RouteGeometry } from '../route/geometry';

export interface LyricSegment {
  id: number;
  text: string;
  /** Début/fin de la ligne dans l'audio, en secondes. */
  start: number;
  end: number;
  /** Tronçon du trajet parcouru pendant la ligne. */
  coords: LngLat[];
}

/** Distance parcourue à vitesse constante : d(t) = clamp(v × t, 0, total). */
export function distanceAtTime(t: number, speedMps: number, total: number): number {
  if (speedMps <= 0) return 0;
  return Math.min(Math.max(t * speedMps, 0), total);
}

export function buildSegments(
  lines: LyricLine[],
  route: RouteGeometry,
  speedMps: number,
): LyricSegment[] {
  return lines.map((line, id) => ({
    id,
    text: line.text,
    start: line.start,
    end: line.end,
    coords: sliceRoute(
      route,
      distanceAtTime(line.start, speedMps, route.total),
      distanceAtTime(line.end, speedMps, route.total),
    ),
  }));
}

/**
 * Décale toutes les lignes de `offset` secondes (positif = paroles retardées).
 * Compense les paroles lrclib synchronisées sur un autre pressage du morceau.
 */
export function shiftLyrics(lines: LyricLine[], offset: number): LyricLine[] {
  return lines.map((l) => ({ ...l, start: l.start + offset, end: l.end + offset }));
}

export type SegState = 'past' | 'current' | 'future';

export function stateAtTime(seg: Pick<LyricSegment, 'start' | 'end'>, t: number): SegState {
  if (t >= seg.end) return 'past';
  if (t >= seg.start) return 'current';
  return 'future';
}
