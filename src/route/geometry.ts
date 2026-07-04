/** [longitude, latitude], comme GeoJSON. */
export type LngLat = [number, number];

export interface RouteGeometry {
  coords: LngLat[];
  /** Distance cumulée (m) du départ jusqu'à chaque sommet. */
  cumulative: number[];
  /** Longueur totale du trajet (m). */
  total: number;
}

const EARTH_RADIUS_M = 6371000;

/** Distance orthodromique (m) entre deux points. */
export function haversine(a: LngLat, b: LngLat): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function buildRouteGeometry(coords: LngLat[]): RouteGeometry {
  const cumulative = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulative.push(cumulative[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  return { coords, cumulative, total: cumulative[cumulative.length - 1] };
}

/** Point situé à `dist` mètres du départ (interpolation linéaire, borné au trajet). */
export function pointAt(route: RouteGeometry, dist: number): LngLat {
  const { coords, cumulative, total } = route;
  const d = Math.min(Math.max(dist, 0), total);
  const i = cumulative.findIndex((c) => c >= d);
  if (i <= 0) return coords[0];
  const segLen = cumulative[i] - cumulative[i - 1];
  const f = segLen === 0 ? 0 : (d - cumulative[i - 1]) / segLen;
  const [x1, y1] = coords[i - 1];
  const [x2, y2] = coords[i];
  return [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f];
}

/** Portion du trajet entre deux distances, extrémités interpolées incluses. */
export function sliceRoute(route: RouteGeometry, from: number, to: number): LngLat[] {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const pts: LngLat[] = [pointAt(route, a)];
  for (let i = 0; i < route.coords.length; i++) {
    if (route.cumulative[i] > a && route.cumulative[i] < b) pts.push(route.coords[i]);
  }
  pts.push(pointAt(route, b));
  return pts;
}
