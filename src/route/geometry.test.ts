import { describe, expect, it } from 'vitest';
import { buildRouteGeometry, pointAt, sliceRoute, haversine } from './geometry';

// À l'équateur, 1° de longitude ≈ 111 195 m (haversine, R = 6 371 km).
describe('buildRouteGeometry', () => {
  it('calcule les distances cumulées et le total', () => {
    const r = buildRouteGeometry([[0, 0], [1, 0], [2, 0]]);
    expect(r.cumulative[0]).toBe(0);
    expect(r.cumulative[1]).toBeCloseTo(111195, -1);
    expect(r.total).toBeCloseTo(222390, -1);
  });

  it('porte la durée OSRM quand elle est fournie, 0 sinon', () => {
    expect(buildRouteGeometry([[0, 0], [1, 0]], 350).duration).toBe(350);
    expect(buildRouteGeometry([[0, 0], [1, 0]]).duration).toBe(0);
  });
});

describe('pointAt', () => {
  it("interpole au milieu d'un segment", () => {
    const r = buildRouteGeometry([[0, 0], [1, 0]]);
    expect(pointAt(r, r.total / 2)[0]).toBeCloseTo(0.5, 5);
  });

  it('borne les distances hors trajet aux extrémités', () => {
    const r = buildRouteGeometry([[0, 0], [1, 0]]);
    expect(pointAt(r, -10)).toEqual([0, 0]);
    expect(pointAt(r, r.total + 10)).toEqual([1, 0]);
  });
});

describe('sliceRoute', () => {
  it('découpe entre deux distances en conservant les sommets intermédiaires', () => {
    const r = buildRouteGeometry([[0, 0], [1, 0], [2, 0]]);
    const s = sliceRoute(r, r.total * 0.25, r.total * 0.75);
    expect(s).toHaveLength(3);
    expect(s[0][0]).toBeCloseTo(0.5, 5);
    expect(s[1][0]).toBeCloseTo(1, 5);
    expect(s[2][0]).toBeCloseTo(1.5, 5);
  });
});

describe('haversine', () => {
  it('mesure ~111,2 km pour 1° de latitude', () => {
    expect(haversine([0, 0], [0, 1])).toBeCloseTo(111195, -2);
  });

  it('vaut 0 pour deux points identiques', () => {
    expect(haversine([2.35, 48.85], [2.35, 48.85])).toBe(0);
  });
});
