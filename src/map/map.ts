import maplibregl from 'maplibre-gl';
import type { LngLat } from '../route/geometry';

export function createMap(container: HTMLElement): maplibregl.Map {
  return new maplibregl.Map({
    container,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [2.3488, 48.8534], // Paris
    zoom: 12,
    attributionControl: { compact: true },
  });
}

/** Suivi caméra fluide : petit easeTo linéaire à chaque tick. */
export function followPoint(map: maplibregl.Map, lngLat: LngLat): void {
  map.easeTo({ center: lngLat, duration: 250, easing: (t) => t });
}
