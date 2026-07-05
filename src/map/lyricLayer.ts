import type maplibregl from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import { stateAtTime } from '../sync/timeline';
import type { WordFeature } from './wordLayout';

const SOURCE_ID = 'lyrics';
const LAYER_ID = 'lyrics-text';

export function wordsToGeoJSON(words: WordFeature[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: words.map((w) => ({
      type: 'Feature',
      id: w.id,
      geometry: { type: 'Point', coordinates: w.lngLat },
      properties: { text: w.word, rotate: w.rotate },
    })),
  };
}

/** Ajoute (ou met à jour) la rivière de paroles le long du trajet, mot à mot. */
export function addLyricLayer(map: maplibregl.Map, words: WordFeature[]): void {
  const data = wordsToGeoJSON(words);
  const existing = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (existing) {
    // Re-created features can reuse ids from a previous route; clear their leftover
    // 'past'/'current' feature-state so they don't render grey/accented before any tick.
    map.removeFeatureState({ source: SOURCE_ID });
    existing.setData(data);
    return;
  }
  map.addSource(SOURCE_ID, { type: 'geojson', data });
  map.addLayer({
    id: LAYER_ID,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      // Un point par MOT, orienté le long du chemin (rotation précalculée) : contrairement
      // au placement line-center, un point s'affiche toujours — l'ancien rendu exigeait
      // que la ligne entière tienne dans son tronçon à l'écran, ce qui masquait la
      // plupart des paroles à tous les zooms (cause racine mesurée : fitting, pas collision).
      'symbol-placement': 'point',
      'text-field': ['get', 'text'],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 15, 13, 17, 16],
      'text-rotate': ['get', 'rotate'],
      'text-rotation-alignment': 'map',
      'text-pitch-alignment': 'map',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
      'text-padding': 0,
    },
    paint: {
      // past = grisé, current = accent karaoké, future = encre foncée.
      // Le gris doit rester nettement plus sombre que les gris du fond de carte,
      // sinon les paroles passées deviennent illisibles aux zooms moyens.
      'text-color': [
        'match',
        ['coalesce', ['feature-state', 'state'], 'future'],
        'past', '#7d8595',
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
  if (!source) return;
  source.setData({ type: 'FeatureCollection', features: [] });
  map.removeFeatureState({ source: SOURCE_ID });
}

export function updateLyricStates(map: maplibregl.Map, words: WordFeature[], t: number): void {
  // Pendant une bascule de fond (setStyle), le style n'est pas encore chargé :
  // setFeatureState jetterait et tuerait la boucle rAF (gel du voyage silencieux).
  if (!map.getSource(SOURCE_ID)) return;
  for (const w of words) {
    map.setFeatureState({ source: SOURCE_ID, id: w.id }, { state: stateAtTime(w, t) });
  }
}
