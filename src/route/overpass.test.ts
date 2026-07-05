import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPoiQuery, fetchPois } from './overpass';

afterEach(() => vi.unstubAllGlobals());

const bbox = { south: 48.79, west: 2.28, north: 48.91, east: 2.42 };

describe('buildPoiQuery', () => {
  it('couvre les 4 catégories sur la bbox, avec out center', () => {
    const q = buildPoiQuery(bbox);
    expect(q).toContain('[out:json]');
    expect(q).toContain('(48.79,2.28,48.91,2.42)');
    expect(q).toContain('tourism');
    expect(q).toContain('historic');
    expect(q).toContain('leisure');
    expect(q).toContain('natural');
    expect(q).toContain('amenity');
    expect(q).toContain('out center');
  });

  it('budget réparti : un out center 16 par famille (pas d\'union tronquée nodes-d\'abord)', () => {
    const q = buildPoiQuery(bbox);
    expect(q.match(/out center 16;/g)).toHaveLength(5);
    expect(q).not.toContain('out center 80');
  });
});

describe('fetchPois', () => {
  it('interroge Overpass en POST et convertit nodes et ways (center) en POI', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          { type: 'node', id: 1, lat: 48.86, lon: 2.34, tags: { tourism: 'viewpoint', name: 'Belvédère' } },
          { type: 'way', id: 2, center: { lat: 48.85, lon: 2.36 }, tags: { leisure: 'park', name: 'Square' } },
          { type: 'node', id: 3, lat: 48.84, lon: 2.35, tags: { natural: 'water' } },
          { type: 'node', id: 4, lat: 48.83, lon: 2.33, tags: { amenity: 'cafe', name: 'Chez Prune' } },
          { type: 'node', id: 5, lat: 48.82, lon: 2.32 }, // sans tags → ignoré
          { type: 'node', id: 6, lat: 48.81, lon: 2.31, tags: { amenity: 'bank' } }, // hors catégories → ignoré
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const pois = await fetchPois(bbox);
    expect(String(fetchMock.mock.calls[0][0])).toContain('overpass-api.de/api/interpreter');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(pois).toEqual([
      { name: 'Belvédère', lngLat: [2.34, 48.86], category: 'monument' },
      { name: 'Square', lngLat: [2.36, 48.85], category: 'park' },
      { name: undefined, lngLat: [2.35, 48.84], category: 'water' },
      { name: 'Chez Prune', lngLat: [2.33, 48.83], category: 'cafe' },
    ]);
  });

  it('dédoublonne par type/id (un élément peut matcher deux familles de sélecteurs)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        elements: [
          { type: 'way', id: 7, center: { lat: 48.85, lon: 2.36 }, tags: { leisure: 'park', historic: 'yes', name: 'Parc historique' } },
          { type: 'way', id: 7, center: { lat: 48.85, lon: 2.36 }, tags: { leisure: 'park', historic: 'yes', name: 'Parc historique' } },
          { type: 'node', id: 7, lat: 48.8, lon: 2.3, tags: { amenity: 'cafe' } }, // même id, autre type : conservé
        ],
      }),
    }));
    const pois = await fetchPois(bbox);
    expect(pois).toHaveLength(2);
    expect(pois[0].category).toBe('monument'); // historic prime sur park
    expect(pois[1].category).toBe('cafe'); // le node/7 (autre type, même id) survit
  });

  it('jette une erreur claire sur statut HTTP non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 504 }));
    await expect(fetchPois(bbox)).rejects.toThrow('Overpass: HTTP 504');
  });
});
