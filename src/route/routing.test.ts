import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRoute, geocode } from './routing';

afterEach(() => vi.unstubAllGlobals());

describe('fetchRoute', () => {
  it('appelle le bon profil OSRM et renvoie les coordonnées GeoJSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [{ geometry: { coordinates: [[2.3, 48.8], [2.4, 48.9]] } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const coords = await fetchRoute([2.3, 48.8], [2.4, 48.9], 'foot');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('routing.openstreetmap.de/routed-foot/');
    expect(url).toContain('2.3,48.8;2.4,48.9');
    expect(url).toContain('geometries=geojson');
    expect(coords).toEqual([[2.3, 48.8], [2.4, 48.9]]);
  });

  it("jette une erreur claire quand OSRM ne trouve pas d'itinéraire", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'NoRoute', routes: [] }),
    }));
    await expect(fetchRoute([0, 0], [1, 1], 'car')).rejects.toThrow('Aucun itinéraire trouvé');
  });

  it('jette une erreur sur statut HTTP non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(fetchRoute([0, 0], [1, 1], 'bike')).rejects.toThrow('Routage : HTTP 429');
  });
});

describe('geocode', () => {
  it('interroge Nominatim et convertit lon/lat en nombres', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ display_name: 'Liège, Paris', lon: '2.3268', lat: '48.8797' }],
    });
    vi.stubGlobal('fetch', fetchMock);
    const results = await geocode('métro Liège');
    expect(String(fetchMock.mock.calls[0][0])).toContain('nominatim.openstreetmap.org/search');
    expect(results).toEqual([{ label: 'Liège, Paris', lngLat: [2.3268, 48.8797] }]);
  });
});
