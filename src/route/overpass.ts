import type { Bbox, Poi, PoiCategory } from './detour';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Requête Overpass QL : les 4 familles de POI du détour, limitées à 80 éléments. */
export function buildPoiQuery(b: Bbox): string {
  const bb = `(${b.south},${b.west},${b.north},${b.east})`;
  const selectors = [
    'nwr["tourism"~"^(attraction|viewpoint|artwork)$"]',
    'nwr["historic"]',
    'nwr["leisure"~"^(park|garden)$"]',
    'nwr["natural"="water"]',
    'nwr["amenity"~"^(cafe|theatre|arts_centre)$"]',
  ];
  return `[out:json][timeout:25];(${selectors.map((s) => s + bb + ';').join('')});out center 80;`;
}

// L'ordre reflète la priorité en cas de tags multiples (un parc historique = monument).
function categorize(tags: Record<string, string>): PoiCategory | undefined {
  if (/^(attraction|viewpoint|artwork)$/.test(tags.tourism ?? '') || tags.historic) return 'monument';
  if (tags.leisure === 'park' || tags.leisure === 'garden') return 'park';
  if (tags.natural === 'water') return 'water';
  if (/^(cafe|theatre|arts_centre)$/.test(tags.amenity ?? '')) return 'cafe';
  return undefined;
}

/** POI des 4 catégories dans la bbox (nodes directs, ways/relations via `out center`). */
export async function fetchPois(bbox: Bbox): Promise<Poi[]> {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(buildPoiQuery(bbox))}`,
  });
  if (!res.ok) throw new Error(`Overpass: HTTP ${res.status}`);
  const data = (await res.json()) as { elements?: OverpassElement[] };
  const pois: Poi[] = [];
  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat === undefined || lon === undefined || !el.tags) continue;
    const category = categorize(el.tags);
    if (!category) continue;
    pois.push({ name: el.tags.name, lngLat: [lon, lat], category });
  }
  return pois;
}
