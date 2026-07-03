import type maplibregl from 'maplibre-gl';
import type { FeatureCollection, LineString } from 'geojson';
import { stateAtTime, type LyricSegment } from '../sync/timeline';

const SOURCE_ID = 'lyrics';
const LAYER_ID = 'lyrics-text';

export function segmentsToGeoJSON(segments: LyricSegment[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: segments.map((s) => ({
      type: 'Feature',
      id: s.id,
      geometry: { type: 'LineString', coordinates: s.coords },
      properties: { text: s.text },
    })),
  };
}

/** Ajoute (ou met à jour) la rivière de paroles le long du trajet. */
export function addLyricLayer(map: maplibregl.Map, segments: LyricSegment[]): void {
  const data = segmentsToGeoJSON(segments);
  const existing = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
    return;
  }
  map.addSource(SOURCE_ID, { type: 'geojson', data });
  map.addLayer({
    id: LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'symbol-placement': 'line-center',
      'text-field': ['get', 'text'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 16,
      'text-keep-upright': true,
      'text-allow-overlap': false,
    },
    paint: {
      // past = grisé, current = accent karaoké, future = encre foncée
      'text-color': [
        'match',
        ['coalesce', ['feature-state', 'state'], 'future'],
        'past', '#a8adb5',
        'current', '#e8336d',
        '#1d2b45',
      ],
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
    },
  });
}

export function clearLyricLayer(map: maplibregl.Map): void {
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  source?.setData({ type: 'FeatureCollection', features: [] });
}

export function updateLyricStates(
  map: maplibregl.Map,
  segments: LyricSegment[],
  t: number,
): void {
  for (const seg of segments) {
    map.setFeatureState({ source: SOURCE_ID, id: seg.id }, { state: stateAtTime(seg, t) });
  }
}
