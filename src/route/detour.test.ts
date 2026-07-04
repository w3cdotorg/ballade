import { describe, expect, it } from 'vitest';
import {
  categoryHints,
  corridorBbox,
  detourMargin,
  needsDetour,
  scorePoi,
  selectWaypoints,
  targetLength,
  type Poi,
} from './detour';

const none = new Set<string>();
const noHints = new Set<never>();

describe('targetLength / needsDetour', () => {
  it('cible = durée × vitesse du profil (à pied 1,3 m/s)', () => {
    expect(targetLength(300, 'foot')).toBeCloseTo(390);
  });

  it('détour proposé quand la chanson dépasse la durée du trajet de 20 %', () => {
    // 1000 m à pied ≈ 769 s ; seuil ×1,2 ≈ 923 s.
    expect(needsDetour(1000, 1000, 'foot')).toBe(true);
    expect(needsDetour(1000, 900, 'foot')).toBe(false);
  });

  it('tient compte du profil (en voiture le même trajet est vite avalé)', () => {
    expect(needsDetour(10000, 1000, 'car')).toBe(false);
    expect(needsDetour(10000, 1200, 'car')).toBe(true);
  });
});

describe('categoryHints', () => {
  it('mappe les mots des paroles vers les catégories de POI', () => {
    expect(categoryHints(new Set(['riviere', 'jardin', 'chateau']))).toEqual(
      new Set(['water', 'park', 'monument']),
    );
  });

  it('vide quand aucun mot ne matche', () => {
    expect(categoryHints(new Set(['voiture', 'lundi']))).toEqual(new Set());
  });
});

describe('scorePoi', () => {
  const poi = (category: Poi['category'], name?: string): Poi => ({
    category,
    name,
    lngLat: [0, 0],
  });

  it('priorité fixe : monuments > parcs > eau > cafés', () => {
    expect(scorePoi(poi('monument'), none, noHints)).toBe(4);
    expect(scorePoi(poi('park'), none, noHints)).toBe(3);
    expect(scorePoi(poi('water'), none, noHints)).toBe(2);
    expect(scorePoi(poi('cafe'), none, noHints)).toBe(1);
  });

  it('bonus de catégorie suggérée par les paroles (+30)', () => {
    expect(scorePoi(poi('water'), none, new Set(['water']))).toBe(32);
  });

  it('gros bonus par mot des paroles présent dans le nom (+100/mot, dédupliqué)', () => {
    const kw = new Set(['jardin', 'plantes']);
    expect(scorePoi(poi('park', 'Jardin des Plantes'), kw, new Set(['park']))).toBe(233);
    expect(scorePoi(poi('cafe', 'Café Jardin Jardin'), new Set(['jardin']), noHints)).toBe(101);
  });
});

describe('corridorBbox / detourMargin', () => {
  it('englobe le trajet avec une marge en mètres convertie en degrés', () => {
    const b = corridorBbox([[2.3, 48.8], [2.4, 48.9]], 1000);
    expect(b.south).toBeCloseTo(48.791, 3);
    expect(b.north).toBeCloseTo(48.909, 3);
    expect(b.west).toBeCloseTo(2.286, 3);
    expect(b.east).toBeCloseTo(2.414, 3);
  });

  it('marge = moitié de la rallonge, bornée à [300 m, 10 km]', () => {
    expect(detourMargin(400)).toBe(300);
    expect(detourMargin(4000)).toBe(2000);
    expect(detourMargin(50000)).toBe(10000);
  });
});

describe('selectWaypoints', () => {
  // Trajet direct ~2224 m plein est sur l'équateur ; les POI sont décalés au nord.
  const start: [number, number] = [0, 0];
  const end: [number, number] = [0.02, 0];
  const direct = 2224;
  const poi = (lngLat: [number, number], category: Poi['category'], name?: string): Poi => ({
    lngLat,
    category,
    name,
  });
  const ctx = (target: number) => ({
    start,
    end,
    directLength: direct,
    target,
    keywords: new Set<string>(),
    hints: new Set<Poi['category']>(),
  });

  it('choisit le POI au meilleur score à géométrie égale', () => {
    // Deux POI symétriques (même rallonge ~624 m) : le monument (4) bat le café (1).
    const monument = poi([0.01, 0.008], 'monument');
    const cafe = poi([0.01, -0.008], 'cafe');
    const sel = selectWaypoints([cafe, monument], ctx(3100));
    expect(sel.waypoints).toEqual([monument]);
    expect(sel.estimatedLength).toBeGreaterThan(2790); // ≥ 90 % de la cible
    expect(sel.estimatedLength).toBeLessThan(3410); // ≤ 110 % de la cible
  });

  it('écarte les candidats qui feraient dépasser 110 % de la cible', () => {
    const tooFar = poi([0.01, 0.05], 'monument'); // rallonge ~9 km
    const sel = selectWaypoints([tooFar], ctx(2500));
    expect(sel.waypoints).toEqual([]);
    expect(sel.estimatedLength).toBe(direct);
  });

  it('enchaîne plusieurs POI, plafonnés à 3', () => {
    const pois = [
      poi([0.004, 0.01], 'monument'),
      poi([0.008, 0.01], 'monument'),
      poi([0.012, 0.01], 'monument'),
      poi([0.016, 0.01], 'monument'),
    ];
    const sel = selectWaypoints(pois, ctx(20000));
    expect(sel.waypoints).toHaveLength(3);
  });

  it('ordonne les waypoints le long de l\'axe depart -> arrivee', () => {
    const late = poi([0.015, 0.006], 'park');
    const early = poi([0.005, 0.006], 'park');
    const sel = selectWaypoints([late, early], ctx(5000));
    expect(sel.waypoints.map((w) => w.lngLat[0])).toEqual([0.005, 0.015]);
  });

  it('estime la longueur à partir de la longueur réelle du trajet direct', () => {
    // directLength (réel OSRM) > haversine : seule la rallonge est estimée à vol d'oiseau.
    const monument = poi([0.01, 0.008], 'monument');
    const sel = selectWaypoints([monument], {
      start,
      end,
      directLength: 3000,
      target: 3900,
      keywords: new Set<string>(),
      hints: new Set<Poi['category']>(),
    });
    expect(sel.waypoints).toEqual([monument]);
    expect(sel.estimatedLength).toBeCloseTo(3624, -2);
  });
});
