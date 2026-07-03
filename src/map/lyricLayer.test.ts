import { describe, expect, it } from 'vitest';
import { segmentsToGeoJSON } from './lyricLayer';

describe('segmentsToGeoJSON', () => {
  it('produit une feature LineString par ligne de paroles, id numérique + texte', () => {
    const fc = segmentsToGeoJSON([
      { id: 0, text: 'bonjour', start: 0, end: 5, coords: [[0, 0], [1, 0]] },
      { id: 1, text: 'monde', start: 5, end: 10, coords: [[1, 0], [2, 0]] },
    ]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].id).toBe(0);
    expect(fc.features[0].geometry).toEqual({ type: 'LineString', coordinates: [[0, 0], [1, 0]] });
    expect(fc.features[0].properties).toEqual({ text: 'bonjour' });
    expect(fc.features[1].properties).toEqual({ text: 'monde' });
  });
});
