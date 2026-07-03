import { describe, expect, it } from 'vitest';
import { layoutWords } from './wordLayout';
import type { LyricSegment } from '../sync/timeline';

const seg = (id: number, text: string, coords: [number, number][]): LyricSegment => ({
  id,
  text,
  start: id * 10,
  end: (id + 1) * 10,
  coords,
});

describe('layoutWords', () => {
  it('place chaque mot en un point, réparti le long du tronçon, ids globaux séquentiels', () => {
    const words = layoutWords([
      seg(0, 'bonjour le monde', [[0, 0], [3, 0]]),
      seg(1, 'salut', [[3, 0], [4, 0]]),
    ]);
    expect(words).toHaveLength(4);
    expect(words.map((w) => w.id)).toEqual([0, 1, 2, 3]);
    expect(words.map((w) => w.word)).toEqual(['bonjour', 'le', 'monde', 'salut']);
    // 3 mots sur [0,3] : centres à 1/6, 3/6, 5/6 du tronçon
    expect(words[0].lngLat[0]).toBeCloseTo(0.5, 4);
    expect(words[1].lngLat[0]).toBeCloseTo(1.5, 4);
    expect(words[2].lngLat[0]).toBeCloseTo(2.5, 4);
    // 1 mot sur [3,4] : centré
    expect(words[3].lngLat[0]).toBeCloseTo(3.5, 4);
    // chaque mot garde les temps de sa ligne parente
    expect(words[0].start).toBe(0);
    expect(words[0].end).toBe(10);
    expect(words[3].start).toBe(10);
  });

  it('oriente le texte le long du chemin : vers l’est → rotation 0', () => {
    const [w] = layoutWords([seg(0, 'est', [[0, 0], [1, 0]])]);
    expect(w.rotate).toBeCloseTo(0, 1);
  });

  it('garde le texte à l’endroit sur un chemin vers l’ouest (flip 180°)', () => {
    const [w] = layoutWords([seg(0, 'ouest', [[1, 0], [0, 0]])]);
    // cap 270° → rotation brute 180° (tête en bas) → flip → 0°
    expect(w.rotate).toBeCloseTo(0, 1);
  });

  it('oriente vers le nord → rotation -90 (mod 360 = 270, flippé à 90)', () => {
    const [w] = layoutWords([seg(0, 'nord', [[0, 0], [0, 1]])]);
    // cap 0° → rotation brute 270° → dans (90,270) exclu ? 270 est hors — lisible tel quel
    expect([90, 270]).toContainEqual(Math.round(w.rotate));
  });

  it('ignore les lignes vides et les espaces multiples', () => {
    expect(layoutWords([seg(0, '  ', [[0, 0], [1, 0]])])).toEqual([]);
    const words = layoutWords([seg(0, 'un  deux', [[0, 0], [1, 0]])]);
    expect(words.map((w) => w.word)).toEqual(['un', 'deux']);
  });
});
