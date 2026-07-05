import { describe, expect, it } from 'vitest';
import { buildRouteGeometry } from '../route/geometry';
import { buildSegments, distanceAtTime, shiftLyrics, stateAtTime } from './timeline';

const route = buildRouteGeometry([[0, 0], [2, 0]]);
const lines = [
  { start: 0, end: 10, text: 'première moitié' },
  { start: 10, end: 20, text: 'seconde moitié' },
];

describe('distanceAtTime', () => {
  it('avance à vitesse constante, bornée au trajet', () => {
    expect(distanceAtTime(10, 50, 1000)).toBe(500);
    expect(distanceAtTime(-5, 50, 1000)).toBe(0);
    expect(distanceAtTime(25, 50, 1000)).toBe(1000);
    expect(distanceAtTime(5, 0, 1000)).toBe(0);
  });
});

describe('buildSegments', () => {
  it('attribue à chaque ligne le tronçon parcouru pendant son intervalle de temps', () => {
    const v = route.total / 20; // la chanson (20 s) couvre exactement le trajet
    const segs = buildSegments(lines, route, v);
    expect(segs).toHaveLength(2);
    expect(segs[0].id).toBe(0);
    expect(segs[0].coords[0]).toEqual([0, 0]);
    expect(segs[0].coords[segs[0].coords.length - 1][0]).toBeCloseTo(1, 5);
    expect(segs[1].coords[0][0]).toBeCloseTo(1, 5);
    expect(segs[1].coords[segs[1].coords.length - 1][0]).toBeCloseTo(2, 5);
  });

  it('chanson plus courte que le trajet : les paroles occupent le tronçon initial', () => {
    const v = route.total / 40; // en 20 s de chanson on ne parcourt que la moitié
    const segs = buildSegments(lines, route, v);
    expect(segs[0].coords[segs[0].coords.length - 1][0]).toBeCloseTo(0.5, 5);
    expect(segs[1].coords[segs[1].coords.length - 1][0]).toBeCloseTo(1, 5);
  });

  it('multi-pistes : lignes décalées par piste, tronçon sans mots entre elles', () => {
    const longRoute = buildRouteGeometry([[0, 0], [4, 0]]);
    const v = longRoute.total / 40; // le voyage complet dure 40 s
    const piste1 = shiftLyrics([{ start: 0, end: 10, text: 'piste un' }], 0);
    const piste2 = shiftLyrics([{ start: 0, end: 10, text: 'piste deux' }], 30);
    const segs = buildSegments([...piste1, ...piste2], longRoute, v);
    expect(segs).toHaveLength(2);
    expect(segs[0].coords[segs[0].coords.length - 1][0]).toBeCloseTo(1, 5); // fin à 1/4
    expect(segs[1].coords[0][0]).toBeCloseTo(3, 5); // reprise à 3/4 : trou sans mots entre les deux
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

describe('shiftLyrics', () => {
  it('décale start/end de chaque ligne sans muter l’original', () => {
    const src = [{ start: 2, end: 4, text: 'a' }];
    const shifted = shiftLyrics(src, 1.5);
    expect(shifted).toEqual([{ start: 3.5, end: 5.5, text: 'a' }]);
    expect(src[0].start).toBe(2);
  });

  it('accepte un décalage négatif', () => {
    expect(shiftLyrics([{ start: 2, end: 4, text: 'a' }], -3)).toEqual([
      { start: -1, end: 1, text: 'a' },
    ]);
  });
});
