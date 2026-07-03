import { describe, expect, it } from 'vitest';
import { buildRouteGeometry } from '../route/geometry';
import { buildSegments, distanceAtTime, stateAtTime } from './timeline';

const route = buildRouteGeometry([[0, 0], [2, 0]]);
const lines = [
  { start: 0, end: 10, text: 'première moitié' },
  { start: 10, end: 20, text: 'seconde moitié' },
];

describe('buildSegments', () => {
  it('attribue à chaque ligne le tronçon proportionnel à son intervalle de temps', () => {
    const segs = buildSegments(lines, route, 20);
    expect(segs).toHaveLength(2);
    expect(segs[0].id).toBe(0);
    expect(segs[0].coords[0]).toEqual([0, 0]);
    expect(segs[0].coords[segs[0].coords.length - 1][0]).toBeCloseTo(1, 5);
    expect(segs[1].coords[0][0]).toBeCloseTo(1, 5);
    expect(segs[1].coords[segs[1].coords.length - 1][0]).toBeCloseTo(2, 5);
  });
});

describe('distanceAtTime', () => {
  it('est proportionnelle et bornée', () => {
    expect(distanceAtTime(10, 20, 1000)).toBe(500);
    expect(distanceAtTime(-5, 20, 1000)).toBe(0);
    expect(distanceAtTime(25, 20, 1000)).toBe(1000);
    expect(distanceAtTime(5, 0, 1000)).toBe(0);
  });
});

describe('stateAtTime', () => {
  const seg = { id: 0, text: 'x', start: 10, end: 20, coords: [] };
  it('passé / courant / futur selon t', () => {
    expect(stateAtTime(seg, 5)).toBe('future');
    expect(stateAtTime(seg, 10)).toBe('current');
    expect(stateAtTime(seg, 19.9)).toBe('current');
    expect(stateAtTime(seg, 20)).toBe('past');
  });
});
