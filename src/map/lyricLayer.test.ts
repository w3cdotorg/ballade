import { describe, expect, it } from 'vitest';
import { wordsToGeoJSON } from './lyricLayer';

describe('wordsToGeoJSON', () => {
  it('produit une feature Point par mot, avec id, texte et rotation', () => {
    const fc = wordsToGeoJSON([
      { id: 0, word: 'bonjour', lngLat: [0.5, 0], rotate: 0, start: 0, end: 5 },
      { id: 1, word: 'monde', lngLat: [1.5, 0], rotate: 45, start: 5, end: 10 },
    ]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].id).toBe(0);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [0.5, 0] });
    expect(fc.features[0].properties).toEqual({ text: 'bonjour', rotate: 0 });
    expect(fc.features[1].properties).toEqual({ text: 'monde', rotate: 45 });
  });
});
