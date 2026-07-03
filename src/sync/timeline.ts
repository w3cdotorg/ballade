import type { LyricLine } from '../lyrics/types';
import { sliceRoute, type LngLat, type RouteGeometry } from '../route/geometry';

export interface LyricSegment {
  id: number;
  text: string;
  /** Début/fin de la ligne dans l'audio, en secondes. */
  start: number;
  end: number;
  /** Tronçon du trajet « possédé » par cette ligne. */
  coords: LngLat[];
}

/** Projette la durée du morceau sur la longueur du trajet : d(t) = total × t / duration. */
export function distanceAtTime(t: number, duration: number, total: number): number {
  if (duration <= 0) return 0;
  return Math.min(Math.max(t / duration, 0), 1) * total;
}

export function buildSegments(
  lines: LyricLine[],
  route: RouteGeometry,
  duration: number,
): LyricSegment[] {
  return lines.map((line, id) => ({
    id,
    text: line.text,
    start: line.start,
    end: line.end,
    coords: sliceRoute(
      route,
      distanceAtTime(line.start, duration, route.total),
      distanceAtTime(line.end, duration, route.total),
    ),
  }));
}

export type SegState = 'past' | 'current' | 'future';

export function stateAtTime(seg: Pick<LyricSegment, 'start' | 'end'>, t: number): SegState {
  if (t >= seg.end) return 'past';
  if (t >= seg.start) return 'current';
  return 'future';
}
