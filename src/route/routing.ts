import type { LngLat } from './geometry';

export type Profile = 'foot' | 'bike' | 'car';

interface OsrmResponse {
  code: string;
  routes?: { geometry: { coordinates: LngLat[] } }[];
}

/** Itinéraire via les serveurs OSRM publics FOSSGIS ; `points` = départ, waypoints, arrivée. */
export async function fetchRoute(points: LngLat[], profile: Profile): Promise<LngLat[]> {
  const pairs = points.map((p) => `${p[0]},${p[1]}`).join(';');
  const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${pairs}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing: HTTP ${res.status}`);
  const data = (await res.json()) as OsrmResponse;
  if (data.code !== 'Ok' || !data.routes?.length) throw new Error('No route found');
  return data.routes[0].geometry.coordinates;
}

interface NominatimResult {
  display_name: string;
  lon: string;
  lat: string;
}

export async function geocode(query: string): Promise<{ label: string; lngLat: LngLat }[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nominatim: HTTP ${res.status}`);
  const data = (await res.json()) as NominatimResult[];
  return data.map((r) => ({ label: r.display_name, lngLat: [Number(r.lon), Number(r.lat)] }));
}
