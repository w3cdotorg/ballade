import { describe, expect, it } from 'vitest';
import { categoryHints, needsDetour, scorePoi, targetLength, type Poi } from './detour';

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
